package borgo

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
)

func TestPush(t *testing.T) {
	type received struct {
		path, key string
		body      map[string]any
	}
	var got received
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.path = r.URL.Path
		got.key = r.Header.Get("X-Borgo-Key")
		json.NewDecoder(r.Body).Decode(&got.body)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	t.Setenv("FRONT_URL", server.URL)
	t.Setenv("BORGO_PUSH_KEY", "s3cret")

	if err := Push("live", "task-created", "hello"); err != nil {
		t.Fatal(err)
	}
	if got.path != "/__borgo/publish" || got.key != "s3cret" {
		t.Errorf("request wrong: %+v", got)
	}
	if got.body["topic"] != "live" || got.body["event"] != "task-created" || got.body["data"] != "hello" {
		t.Errorf("payload wrong: %+v", got.body)
	}
}

func TestPushTDelegates(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&got)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	t.Setenv("FRONT_URL", server.URL)

	type payload struct {
		Title string `json:"title"`
	}
	if err := PushT("live", "created", payload{Title: "t"}); err != nil {
		t.Fatal(err)
	}
	data, ok := got["data"].(map[string]any)
	if got["topic"] != "live" || got["event"] != "created" || !ok || data["title"] != "t" {
		t.Errorf("payload wrong: %+v", got)
	}
}

func TestPushClientHasTimeout(t *testing.T) {
	if pushClient.Timeout <= 0 {
		t.Fatal("pushClient must carry a timeout, or a hung front server blocks handlers forever")
	}
}

// pushes go to one host: without a raised idle-connection cap, concurrent
// pushes open a socket per call and eat the ephemeral port range
func TestPushReusesConnections(t *testing.T) {
	const workers, each = 16, 50
	var requests, opened atomic.Int64
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	server.Config.ConnState = func(_ net.Conn, state http.ConnState) {
		if state == http.StateNew {
			opened.Add(1)
		}
	}
	server.Start()
	defer server.Close()
	t.Setenv("FRONT_URL", server.URL)

	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range each {
				if err := Push("live", "created", map[string]int{"id": 1}); err != nil {
					t.Error(err)
					return
				}
			}
		}()
	}
	wg.Wait()

	if got := requests.Load(); got != workers*each {
		t.Fatalf("front server saw %d pushes, want %d", got, workers*each)
	}
	// generous: reuse should keep this near the worker count, a fresh
	// connection per push would be workers*each
	if got := opened.Load(); got > workers*each/4 {
		t.Fatalf("%d connections opened for %d pushes: they are not being reused", got, workers*each)
	}
}

func TestPushRejected(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "forbidden", http.StatusForbidden)
	}))
	defer server.Close()

	t.Setenv("FRONT_URL", server.URL)
	if err := Push("live", "x", nil); err == nil {
		t.Fatal("want error on non-204 response")
	}
}
