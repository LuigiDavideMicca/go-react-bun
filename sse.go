package borgo

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// sseWriteTimeout bounds each frame write, so one blackholed client cannot
// pin its goroutine (and hub slot) forever
const sseWriteTimeout = 10 * time.Second

// SSEStream is one open server-sent-events response.
type SSEStream struct {
	w  http.ResponseWriter
	f  http.Flusher
	r  *http.Request
	rc *http.ResponseController
	mu sync.Mutex
}

// SSE prepares the response for server-sent events and returns the stream.
// The front server proxies it to the browser without buffering.
func SSE(w http.ResponseWriter, r *http.Request) (*SSEStream, error) {
	f, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return nil, errors.New("borgo.SSE: response writer does not support flushing")
	}
	// a stream outlives any server-wide read/write timeout: clear the
	// deadlines on this connection so a configured timeout kills slow
	// requests without killing event streams; each write re-arms its own
	// short deadline instead
	rc := http.NewResponseController(w)
	rc.SetReadDeadline(time.Time{})
	rc.SetWriteDeadline(time.Time{})
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	f.Flush()
	return &SSEStream{w: w, f: f, r: r, rc: rc}, nil
}

// Send writes one named event with data encoded as JSON. The event name must
// not contain newlines - they would let one event smuggle extra frames.
func (s *SSEStream) Send(event string, data any) error {
	if strings.ContainsAny(event, "\r\n") {
		return fmt.Errorf("borgo: sse event name must not contain newlines: %q", event)
	}
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rc.SetWriteDeadline(time.Now().Add(sseWriteTimeout))
	defer s.rc.SetWriteDeadline(time.Time{})
	if _, err := fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", event, payload); err != nil {
		return err
	}
	s.f.Flush()
	return nil
}

// Ping writes a comment line so proxies don't close an idle stream.
func (s *SSEStream) Ping() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rc.SetWriteDeadline(time.Now().Add(sseWriteTimeout))
	defer s.rc.SetWriteDeadline(time.Time{})
	if _, err := fmt.Fprint(s.w, ": ping\n\n"); err != nil {
		return err
	}
	s.f.Flush()
	return nil
}

// Done closes when the client disconnects.
func (s *SSEStream) Done() <-chan struct{} {
	return s.r.Context().Done()
}

type hubMsg struct {
	event string
	data  any
}

// SSEHub broadcasts events to every connected client. Register its ServeHTTP
// as a route handler and call Publish from anywhere:
//
//	var events = borgo.NewSSEHub()
//
//	//borgo:route GET /api/events
//	func Events(w http.ResponseWriter, r *http.Request) { events.ServeHTTP(w, r) }
type SSEHub struct {
	mu   sync.Mutex
	subs map[chan hubMsg]struct{}
}

func NewSSEHub() *SSEHub {
	return &SSEHub{subs: map[chan hubMsg]struct{}{}}
}

// Publish sends the event to every connected client. Clients too slow to
// keep up skip messages instead of blocking the publisher.
func (h *SSEHub) Publish(event string, data any) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- hubMsg{event, data}:
		default:
		}
	}
}

// ServeHTTP streams hub events to one client until it disconnects.
func (h *SSEHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	stream, err := SSE(w, r)
	if err != nil {
		return
	}
	ch := make(chan hubMsg, 8)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.subs, ch)
		h.mu.Unlock()
	}()

	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-stream.Done():
			return
		case <-ping.C:
			if stream.Ping() != nil {
				return
			}
		case m := <-ch:
			if stream.Send(m.event, m.data) != nil {
				return
			}
		}
	}
}
