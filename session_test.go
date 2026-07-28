package borgo

import (
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestClearSession(t *testing.T) {
	w := httptest.NewRecorder()
	ClearSession(w)
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || cookies[0].MaxAge != -1 || cookies[0].Value != "" {
		t.Fatalf("clear cookie wrong: %+v", cookies)
	}
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
