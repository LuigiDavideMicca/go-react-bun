package borgo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestHealthz(t *testing.T) {
	rec := httptest.NewRecorder()
	healthz(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("content-type = %q", ct)
	}
	var body struct {
		Status string   `json:"status"`
		Uptime *float64 `json:"uptime"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "ok" || body.Uptime == nil || *body.Uptime < 0 {
		t.Errorf("body wrong: %s", rec.Body.String())
	}
}

func TestHandleValidation(t *testing.T) {
	ok := func(http.ResponseWriter, *http.Request) {}
	cases := []struct {
		name      string
		pattern   string
		handler   http.HandlerFunc
		wantPanic string
	}{
		{"valid", "GET /api/ok", ok, ""},
		{"valid with param", "DELETE /api/ok/{id}", ok, ""},
		{"missing method", "/api/x", ok, "pattern must be"},
		{"lowercase method", "get /api/x", ok, "pattern must be"},
		{"no space", "GET/api/x", ok, "pattern must be"},
		{"path without slash", "GET api/x", ok, "pattern must be"},
		{"nil handler", "GET /api/nil", nil, "nil handler"},
		{"duplicate", "GET /api/ok", ok, "registered twice"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			defer func() {
				r := recover()
				if c.wantPanic == "" {
					if r != nil {
						t.Fatalf("unexpected panic: %v", r)
					}
					return
				}
				msg, _ := r.(string)
				if r == nil || !strings.Contains(msg, c.wantPanic) {
					t.Fatalf("want panic containing %q, got %v", c.wantPanic, r)
				}
			}()
			Handle(c.pattern, c.handler)
		})
	}
}

func TestHandleIsConcurrencySafe(t *testing.T) {
	const n = 64
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			Handle(fmt.Sprintf("GET /api/concurrent/%d", i), func(http.ResponseWriter, *http.Request) {})
		}()
	}
	wg.Wait()

	routesMu.Lock()
	defer routesMu.Unlock()
	for i := range n {
		if _, ok := routes[fmt.Sprintf("GET /api/concurrent/%d", i)]; !ok {
			t.Fatalf("route %d lost in the race", i)
		}
	}
}

// a recovered panic must leave the registry locked-free for the next caller
func TestHandleRecoversAndStaysUsable(t *testing.T) {
	func() {
		defer func() { recover() }()
		Handle("GET /api/{bad", func(http.ResponseWriter, *http.Request) {})
	}()
	done := make(chan struct{})
	go func() {
		defer close(done)
		Handle("GET /api/after-panic", func(http.ResponseWriter, *http.Request) {})
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("registry deadlocked after a rejected pattern")
	}
}
