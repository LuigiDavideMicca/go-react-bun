package borgo

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSSEStream(t *testing.T) {
	w := httptest.NewRecorder()
	stream, err := SSE(w, httptest.NewRequest(http.MethodGet, "/events", nil))
	if err != nil {
		t.Fatal(err)
	}
	if ct := w.Header().Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("Content-Type = %q", ct)
	}
	if cc := w.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("Cache-Control = %q", cc)
	}

	if err := stream.Send("greet", map[string]string{"msg": "ciao"}); err != nil {
		t.Fatal(err)
	}
	if err := stream.Ping(); err != nil {
		t.Fatal(err)
	}

	body := w.Body.String()
	if !strings.Contains(body, "event: greet\ndata: {\"msg\":\"ciao\"}\n\n") {
		t.Errorf("event framing wrong:\n%s", body)
	}
	if !strings.Contains(body, ": ping\n\n") {
		t.Errorf("ping framing wrong:\n%s", body)
	}
}

type noFlushWriter struct{ header http.Header }

func (w *noFlushWriter) Header() http.Header       { return w.header }
func (w *noFlushWriter) Write(b []byte) (int, error) { return len(b), nil }
func (w *noFlushWriter) WriteHeader(int)           {}

func TestSSERequiresFlusher(t *testing.T) {
	if _, err := SSE(&noFlushWriter{header: http.Header{}}, httptest.NewRequest(http.MethodGet, "/", nil)); err == nil {
		t.Fatal("want error for non-flushing writer")
	}
}

func TestHubSkipsSlowClients(t *testing.T) {
	hub := NewSSEHub()
	slow := make(chan hubMsg, 1)
	hub.mu.Lock()
	hub.subs[slow] = struct{}{}
	hub.mu.Unlock()

	hub.Publish("first", 1)
	hub.Publish("second", 2)

	if len(slow) != 1 {
		t.Fatalf("want exactly one buffered message, got %d", len(slow))
	}
	if msg := <-slow; msg.event != "first" {
		t.Fatalf("kept message = %q, want first", msg.event)
	}
}

func TestHubBroadcast(t *testing.T) {
	hub := NewSSEHub()
	server := httptest.NewServer(hub)
	defer server.Close()

	res, err := http.Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	// wait for the subscription to register before publishing
	deadline := time.Now().Add(2 * time.Second)
	for {
		hub.mu.Lock()
		n := len(hub.subs)
		hub.mu.Unlock()
		if n == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("client never subscribed")
		}
		time.Sleep(5 * time.Millisecond)
	}

	hub.Publish("task-created", map[string]int{"id": 7})

	scanner := bufio.NewScanner(res.Body)
	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
		if len(lines) == 2 {
			break
		}
	}
	if len(lines) != 2 || lines[0] != "event: task-created" || lines[1] != `data: {"id":7}` {
		t.Fatalf("broadcast frames wrong: %q", lines)
	}
}
