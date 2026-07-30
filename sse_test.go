package borgo

import (
	"bufio"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
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

func (w *noFlushWriter) Header() http.Header         { return w.header }
func (w *noFlushWriter) Write(b []byte) (int, error) { return len(b), nil }
func (w *noFlushWriter) WriteHeader(int)             {}

func TestSSERequiresFlusher(t *testing.T) {
	if _, err := SSE(&noFlushWriter{header: http.Header{}}, httptest.NewRequest(http.MethodGet, "/", nil)); err == nil {
		t.Fatal("want error for non-flushing writer")
	}
}

func TestHubSkipsSlowClients(t *testing.T) {
	hub := NewSSEHub()
	slow := make(chan []byte, 1)
	hub.mu.Lock()
	hub.subs[slow] = struct{}{}
	hub.mu.Unlock()

	hub.Publish("first", 1)
	hub.Publish("second", 2)

	if len(slow) != 1 {
		t.Fatalf("want exactly one buffered message, got %d", len(slow))
	}
	if frame := string(<-slow); !strings.HasPrefix(frame, "event: first\n") {
		t.Fatalf("kept message = %q, want first", frame)
	}
}

// an unencodable payload used to travel to every subscriber and fail there,
// closing every open stream
func TestHubDropsUnpublishableEvents(t *testing.T) {
	hub := NewSSEHub()
	sub := make(chan []byte, 4)
	hub.mu.Lock()
	hub.subs[sub] = struct{}{}
	hub.mu.Unlock()

	hub.Publish("broken", make(chan int))
	hub.Publish("multi\nline", 1)
	hub.Publish("fine", 1)

	if len(sub) != 1 {
		t.Fatalf("want only the valid event queued, got %d", len(sub))
	}
	if frame := string(<-sub); !strings.HasPrefix(frame, "event: fine\n") {
		t.Fatalf("queued frame = %q", frame)
	}
}

func TestHubUnderConcurrentSubscribers(t *testing.T) {
	hub := NewSSEHub()
	server := httptest.NewServer(hub)
	defer server.Close()

	stop := make(chan struct{})
	var publishers sync.WaitGroup
	for p := range 4 {
		publishers.Add(1)
		go func() {
			defer publishers.Done()
			for i := 0; ; i++ {
				select {
				case <-stop:
					return
				default:
				}
				hub.Publish("tick", map[string]int{"p": p, "i": i})
			}
		}()
	}

	var clients sync.WaitGroup
	for range 16 {
		clients.Add(1)
		go func() {
			defer clients.Done()
			for range 8 {
				ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
				req, _ := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
				res, err := http.DefaultClient.Do(req)
				if err == nil {
					io.Copy(io.Discard, io.LimitReader(res.Body, 1<<12))
					res.Body.Close()
				}
				cancel()
			}
		}()
	}
	clients.Wait()
	close(stop)
	publishers.Wait()

	// every stream that ended must have unsubscribed: a hub that leaks slots
	// grows without bound
	deadline := time.Now().Add(5 * time.Second)
	for {
		hub.mu.Lock()
		n := len(hub.subs)
		hub.mu.Unlock()
		if n == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("%d subscriptions leaked after every client disconnected", n)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func BenchmarkHubPublish(b *testing.B) {
	hub := NewSSEHub()
	for range 100 {
		ch := make(chan []byte, 1)
		hub.subs[ch] = struct{}{}
		// drain so the buffer never fills and short-circuits the send
		go func() {
			for range ch {
			}
		}()
	}
	payload := map[string]any{"id": 7, "title": "a task", "done": false}
	b.ReportAllocs()
	for b.Loop() {
		hub.Publish("task-created", payload)
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
