package borgo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// a hung front server must not block the api handler that called Push
var pushClient = &http.Client{Timeout: 5 * time.Second, Transport: pushTransport()}

// every push goes to the same host, and DefaultTransport parks only two idle
// connections per host: concurrent pushes would open a socket per call and
// burn through the ephemeral port range
func pushTransport() *http.Transport {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.MaxIdleConnsPerHost = 64
	return t
}

// PushT is Push with the payload type visible to static analysis. Call it
// with literal topic and event strings and borgogen records the payload type
// in the generated event map, typing the browser's subscribe callback for
// that topic (mirroring how borgo.JSON[T] types a route's response).
func PushT[T any](topic, event string, data T) error {
	return Push(topic, event, data)
}

// Push publishes an event to every browser subscribed to a websocket topic
// on the front server (see the subscribe helper in the borgo npm package).
// The front server is assumed on localhost; set FRONT_URL when it is not,
// and BORGO_PUSH_KEY on both sides when pushing across hosts.
func Push(topic, event string, data any) error {
	payload, err := json.Marshal(map[string]any{"topic": topic, "event": event, "data": data})
	if err != nil {
		return err
	}

	base := os.Getenv("FRONT_URL")
	if base == "" {
		port := os.Getenv("PORT")
		if port == "" {
			port = "3000"
		}
		base = "http://localhost:" + port
	}

	url := strings.TrimRight(base, "/") + "/__borgo/publish"
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if key := os.Getenv("BORGO_PUSH_KEY"); key != "" {
		req.Header.Set("X-Borgo-Key", key)
	}

	resp, err := pushClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	// drain so the keep-alive connection is reusable
	io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10))
	if resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("borgo.Push: front server responded %d", resp.StatusCode)
	}
	return nil
}
