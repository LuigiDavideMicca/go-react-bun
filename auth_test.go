package borgo

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type testUser struct {
	Name string `json:"name"`
}

func testAuth(t *testing.T) (*Auth[testUser], map[string]string) {
	t.Helper()
	t.Setenv("SESSION_SECRET", "test-secret")
	hash, err := DefaultHasher.Hash("hunter22")
	if err != nil {
		t.Fatal(err)
	}
	users := map[string]string{"luigi": hash}
	auth := &Auth[testUser]{
		Lookup: func(ctx context.Context, username string) (testUser, string, error) {
			h, ok := users[username]
			if !ok {
				return testUser{}, "", errors.New("no such user")
			}
			return testUser{Name: username}, h, nil
		},
		Register: func(ctx context.Context, username, hash string) (testUser, error) {
			if _, taken := users[username]; taken {
				return testUser{}, ErrUserExists
			}
			users[username] = hash
			return testUser{Name: username}, nil
		},
	}
	return auth, users
}

func postJSON(handler http.HandlerFunc, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	w := httptest.NewRecorder()
	handler(w, r)
	return w
}

func TestHasherRoundTrip(t *testing.T) {
	hash, err := DefaultHasher.Hash("s3cret")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "pbkdf2$600000$") {
		t.Errorf("hash format wrong: %s", hash)
	}
	if !DefaultHasher.Verify("s3cret", hash) {
		t.Error("correct password rejected")
	}
	if DefaultHasher.Verify("wrong", hash) {
		t.Error("wrong password accepted")
	}
	again, _ := DefaultHasher.Hash("s3cret")
	if again == hash {
		t.Error("two hashes of the same password must differ (random salt)")
	}
}

func TestHasherRejectsMalformed(t *testing.T) {
	for _, hash := range []string{"", "plain", "pbkdf2$abc$x$y", "pbkdf2$1000$!!$!!", "argon2$1$a$b"} {
		if DefaultHasher.Verify("anything", hash) {
			t.Errorf("malformed hash %q verified", hash)
		}
	}
}

func TestLoginHandler(t *testing.T) {
	auth, _ := testAuth(t)

	w := postJSON(auth.LoginHandler, `{"username":"luigi","password":"hunter22"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, w.Body)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "borgo_session" {
		t.Fatalf("want session cookie, got %+v", cookies)
	}
	r := sessionRequest(cookies[0])
	principal, ok := GetSession[testUser](r)
	if !ok || principal.Name != "luigi" {
		t.Fatalf("session principal wrong: %+v ok=%v", principal, ok)
	}

	for name, body := range map[string]string{
		"wrong password": `{"username":"luigi","password":"nope"}`,
		"unknown user":   `{"username":"ghost","password":"hunter22"}`,
	} {
		if w := postJSON(auth.LoginHandler, body); w.Code != http.StatusUnauthorized {
			t.Errorf("%s: want 401, got %d", name, w.Code)
		}
	}
	for name, body := range map[string]string{
		"empty fields": `{"username":"","password":""}`,
		"not json":     `not json`,
	} {
		if w := postJSON(auth.LoginHandler, body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: want 400, got %d", name, w.Code)
		}
	}
}

func TestLoginCustomPrincipal(t *testing.T) {
	auth, _ := testAuth(t)
	auth.Principal = func(u testUser) any { return map[string]string{"user": u.Name} }

	w := postJSON(auth.LoginHandler, `{"username":"luigi","password":"hunter22"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	principal, ok := GetSession[map[string]string](sessionRequest(w.Result().Cookies()[0]))
	if !ok || principal["user"] != "luigi" {
		t.Fatalf("custom principal wrong: %+v", principal)
	}
}

func TestRegisterHandler(t *testing.T) {
	auth, users := testAuth(t)

	w := postJSON(auth.RegisterHandler, `{"username":"newby","password":"pw123456"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", w.Code, w.Body)
	}
	if len(w.Result().Cookies()) != 1 {
		t.Fatal("register must start a session")
	}
	if !DefaultHasher.Verify("pw123456", users["newby"]) {
		t.Error("stored hash does not verify")
	}

	if w := postJSON(auth.RegisterHandler, `{"username":"luigi","password":"pw"}`); w.Code != http.StatusConflict {
		t.Errorf("taken username: want 409, got %d", w.Code)
	}

	auth.Register = nil
	if w := postJSON(auth.RegisterHandler, `{"username":"x","password":"y"}`); w.Code != http.StatusNotFound {
		t.Errorf("no register provider: want 404, got %d", w.Code)
	}
}

func TestLogoutHandler(t *testing.T) {
	auth, _ := testAuth(t)
	w := postJSON(auth.LogoutHandler, "")
	if w.Code != http.StatusNoContent {
		t.Fatalf("want 204, got %d", w.Code)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || cookies[0].MaxAge != -1 {
		t.Fatalf("logout must clear the cookie: %+v", cookies)
	}
}

func TestLoginShedsLoadWhenSaturated(t *testing.T) {
	auth, _ := testAuth(t)
	prev := hashWait
	hashWait = 20 * time.Millisecond
	defer func() { hashWait = prev }()

	for range cap(hashSlots) {
		hashSlots <- struct{}{}
	}
	defer func() {
		for range cap(hashSlots) {
			<-hashSlots
		}
	}()

	w := postJSON(auth.LoginHandler, `{"username":"luigi","password":"hunter22"}`)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503 when every hashing slot is busy, got %d", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Error("a 503 must carry Retry-After")
	}
}

func TestLoginUnderConcurrency(t *testing.T) {
	auth, _ := testAuth(t)
	// hashing is an order of magnitude slower under the race detector: this
	// asserts that queued logins all get served, not how fast
	prev := hashWait
	hashWait = time.Minute
	defer func() { hashWait = prev }()

	var wg sync.WaitGroup
	codes := make([]int, 12)
	for i := range codes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			body := `{"username":"luigi","password":"hunter22"}`
			if i%3 == 0 {
				body = `{"username":"ghost","password":"hunter22"}`
			}
			codes[i] = postJSON(auth.LoginHandler, body).Code
		}()
	}
	wg.Wait()

	for i, code := range codes {
		want := http.StatusOK
		if i%3 == 0 {
			want = http.StatusUnauthorized
		}
		if code != want {
			t.Errorf("login %d: got %d, want %d", i, code, want)
		}
	}
	if len(hashSlots) != 0 {
		t.Fatalf("%d hashing slots leaked", len(hashSlots))
	}
}

// a rotated cookie on login is what keeps a planted session from surviving
// the privilege change
func TestLoginReplacesAnExistingSession(t *testing.T) {
	auth, _ := testAuth(t)

	planted := setAndExtract(t, testUser{Name: "attacker"}, time.Hour)
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"username":"luigi","password":"hunter22"}`))
	r.AddCookie(planted)
	w := httptest.NewRecorder()
	auth.LoginHandler(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	fresh := w.Result().Cookies()
	if len(fresh) != 1 || fresh[0].Value == planted.Value {
		t.Fatalf("login must issue a new session cookie, got %+v", fresh)
	}
	principal, ok := GetSession[testUser](sessionRequest(fresh[0]))
	if !ok || principal.Name != "luigi" {
		t.Fatalf("session still holds %+v", principal)
	}
}

func TestAuthed(t *testing.T) {
	t.Setenv("SESSION_SECRET", "test-secret")
	handler := Authed(func(w http.ResponseWriter, r *http.Request) {
		WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	w := httptest.NewRecorder()
	handler(w, sessionRequest(nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("no session: want 401, got %d", w.Code)
	}
	var body map[string]string
	if json.Unmarshal(w.Body.Bytes(), &body) != nil || body["error"] == "" {
		t.Fatalf("401 must be json with an error: %s", w.Body)
	}

	cookie := setAndExtract(t, testUser{Name: "luigi"}, time.Hour)
	w = httptest.NewRecorder()
	handler(w, sessionRequest(cookie))
	if w.Code != http.StatusOK {
		t.Fatalf("valid session: want 200, got %d", w.Code)
	}

	w = httptest.NewRecorder()
	handler(w, sessionRequest(&http.Cookie{Name: "borgo_session", Value: "forged.sig"}))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("forged session: want 401, got %d", w.Code)
	}
}
