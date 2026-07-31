package borgo

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestCacheHeaders(t *testing.T) {
	cases := []struct {
		name string
		set  func(w *httptest.ResponseRecorder)
		want string
	}{
		{"max age", func(w *httptest.ResponseRecorder) { Cache(w, 5*time.Minute) }, "public, max-age=300"},
		{
			"stale while revalidate",
			func(w *httptest.ResponseRecorder) { Cache(w, time.Minute, 10*time.Minute) },
			"public, max-age=60, stale-while-revalidate=600",
		},
		{"no cache", func(w *httptest.ResponseRecorder) { NoCache(w) }, "no-store"},
		{"negative age", func(w *httptest.ResponseRecorder) { Cache(w, -time.Hour) }, "public, max-age=0"},
		{
			// over 2^31-1 seconds: must stay exact on 32-bit platforms too
			"a century",
			func(w *httptest.ResponseRecorder) { Cache(w, 100*365*24*time.Hour) },
			"public, max-age=3153600000",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c.set(w)
			if got := w.Header().Get("Cache-Control"); got != c.want {
				t.Fatalf("Cache-Control = %q, want %q", got, c.want)
			}
		})
	}
}
