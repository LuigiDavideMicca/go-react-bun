package borgo

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
