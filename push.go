package borgo

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

// a hung front server must not block the api handler that called Push
var pushClient = &http.Client{Timeout: 5 * time.Second}

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

	req, err := http.NewRequest(http.MethodPost, base+"/__borgo/publish", bytes.NewReader(payload))
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
	if resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("borgo.Push: front server responded %d", resp.StatusCode)
	}
	return nil
}
