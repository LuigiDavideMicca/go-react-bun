package borgo

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type testSession struct {
	User string `json:"user"`
	Role string `json:"role"`
}

func sessionRequest(cookie *http.Cookie) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	if cookie != nil {
		r.AddCookie(cookie)
	}
	return r
}

func setAndExtract(t *testing.T, v any, maxAge time.Duration) *http.Cookie {
	t.Helper()
	w := httptest.NewRecorder()
	if err := SetSession(w, v, maxAge); err != nil {
		t.Fatal(err)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("want one cookie, got %d", len(cookies))
	}
	return cookies[0]
}

func TestSessionRoundTrip(t *testing.T) {
	t.Setenv("SESSION_SECRET", "test-secret")
	cookie := setAndExtract(t, testSession{User: "luigi", Role: "admin"}, time.Hour)

	if !cookie.HttpOnly || cookie.Path != "/" || cookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("cookie attributes wrong: %+v", cookie)
	}
	got, ok := GetSession[testSession](sessionRequest(cookie))
	if !ok || got.User != "luigi" || got.Role != "admin" {
		t.Fatalf("round trip failed: %+v ok=%v", got, ok)
	}
}

func TestSessionRejects(t *testing.T) {
	t.Setenv("SESSION_SECRET", "test-secret")
	valid := setAndExtract(t, testSession{User: "luigi"}, time.Hour)

	tamperedValue := valid.Value
	tamperedValue = strings.Replace(tamperedValue, tamperedValue[2:3], "x", 1)
	if tamperedValue == valid.Value {
		tamperedValue = "y" + tamperedValue[1:]
	}

	cases := []struct {
		name   string
		cookie *http.Cookie
		setup  func(t *testing.T)
	}{
		{"missing cookie", nil, nil},
		{"tampered payload", &http.Cookie{Name: "borgo_session", Value: tamperedValue}, nil},
		{"garbage value", &http.Cookie{Name: "borgo_session", Value: "not.a.session"}, nil},
		{"no signature separator", &http.Cookie{Name: "borgo_session", Value: "nodothere"}, nil},
		{"expired", setAndExtract(t, testSession{User: "luigi"}, -time.Second), nil},
		{"oversized value", &http.Cookie{Name: "borgo_session", Value: strings.Repeat("a", sessionCookieMaxLen+1) + ".sig"}, nil},
		{"wrong secret", valid, func(t *testing.T) { t.Setenv("SESSION_SECRET", "other-secret") }},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if c.setup != nil {
				c.setup(t)
			}
			if got, ok := GetSession[testSession](sessionRequest(c.cookie)); ok {
				t.Fatalf("session accepted, want rejection: %+v", got)
			}
		})
	}
}

// cookie tossing: a request can carry more than one borgo_session, and
// net/http hands back the first one
func TestSessionDuplicateCookies(t *testing.T) {
	t.Setenv("SESSION_SECRET", "a-secret-that-is-at-least-32-bytes")
	mine := setAndExtract(t, testSession{User: "victim"}, time.Hour)
	attacker := setAndExtract(t, testSession{User: "attacker"}, time.Hour)

	request := func(values ...string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		for _, v := range values {
			r.AddCookie(&http.Cookie{Name: sessionCookie, Value: v})
		}
		return r
	}

	t.Run("a tossed valid session must not take over", func(t *testing.T) {
		for _, order := range [][]string{{attacker.Value, mine.Value}, {mine.Value, attacker.Value}} {
			got, ok := GetSession[testSession](request(order...))
			if ok {
				t.Fatalf("two signed sessions are ambiguous, got %+v", got)
			}
		}
	})

	t.Run("junk duplicates do not shadow the real session", func(t *testing.T) {
		for _, order := range [][]string{{"junk", mine.Value}, {mine.Value, "junk"}, {"a.b", mine.Value, "nodot"}} {
			got, ok := GetSession[testSession](request(order...))
			if !ok || got.User != "victim" {
				t.Fatalf("cookies %v: got %+v ok=%v, want the signed session", order, got, ok)
			}
		}
	})

	t.Run("an empty payload cookie is not a session", func(t *testing.T) {
		if _, ok := GetSession[testSession](request("." + sessionSign(""))); ok {
			t.Fatal("a signed empty payload must not pass as a session")
		}
	})
}

func TestClearSession(t *testing.T) {
	w := httptest.NewRecorder()
	ClearSession(w)
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || cookies[0].MaxAge != -1 || cookies[0].Value != "" {
		t.Fatalf("clear cookie wrong: %+v", cookies)
	}
}

// pooled macs must not outlive the secret they were built for
func TestSessionSignFollowsTheSecret(t *testing.T) {
	t.Setenv("SESSION_SECRET", "first-secret-first-secret-first")
	first := sessionSign("a-payload")
	t.Setenv("SESSION_SECRET", "second-secret-second-secret-second")
	second := sessionSign("a-payload")
	t.Setenv("SESSION_SECRET", "first-secret-first-secret-first")
	again := sessionSign("a-payload")

	if first == second {
		t.Fatal("a rotated secret must produce a different signature")
	}
	if first != again {
		t.Fatal("the same secret must produce the same signature")
	}
}

func TestSessionConcurrentRoundTrips(t *testing.T) {
	t.Setenv("SESSION_SECRET", "a-secret-that-is-at-least-32-bytes")
	var wg sync.WaitGroup
	for i := range 32 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			want := testSession{User: fmt.Sprintf("user-%d", i), Role: "member"}
			for range 20 {
				w := httptest.NewRecorder()
				if err := SetSession(w, want, time.Hour); err != nil {
					t.Errorf("user %d: %v", i, err)
					return
				}
				got, ok := GetSession[testSession](sessionRequest(w.Result().Cookies()[0]))
				if !ok || got != want {
					t.Errorf("user %d: round trip gave %+v ok=%v", i, got, ok)
					return
				}
			}
		}()
	}
	wg.Wait()
}

func TestSessionSecretRequired(t *testing.T) {
	t.Setenv("SESSION_SECRET", "")
	defer func() {
		if r := recover(); r == nil || !strings.Contains(r.(string), "SESSION_SECRET") {
			t.Fatalf("want actionable panic, got %v", r)
		}
	}()
	SetSession(httptest.NewRecorder(), testSession{}, time.Hour)
}
