package borgo

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestServerConfigDefaults(t *testing.T) {
	srv := newServer("3501", http.NewServeMux())
	if srv.Addr != ":3501" {
		t.Errorf("addr: %s", srv.Addr)
	}
	if srv.ReadHeaderTimeout != 5*time.Second {
		t.Errorf("read header timeout: %v", srv.ReadHeaderTimeout)
	}
	if srv.IdleTimeout != 2*time.Minute {
		t.Errorf("idle timeout: %v", srv.IdleTimeout)
	}
	// wall-clock deadlines on the whole request would kill sse streams
	if srv.ReadTimeout != 0 || srv.WriteTimeout != 0 {
		t.Errorf("read/write timeouts must default to 0: %v %v", srv.ReadTimeout, srv.WriteTimeout)
	}
}

func TestServerConfigEnvOverrides(t *testing.T) {
	t.Setenv("BORGO_READ_HEADER_TIMEOUT", "11s")
	t.Setenv("BORGO_READ_TIMEOUT", "30s")
	t.Setenv("BORGO_WRITE_TIMEOUT", "45s")
	t.Setenv("BORGO_IDLE_TIMEOUT", "0")
	srv := newServer("3501", nil)
	if srv.ReadHeaderTimeout != 11*time.Second || srv.ReadTimeout != 30*time.Second ||
		srv.WriteTimeout != 45*time.Second || srv.IdleTimeout != 0 {
		t.Errorf("overrides not applied: %+v", srv)
	}
}

func TestServerConfigRejectsGarbage(t *testing.T) {
	t.Setenv("BORGO_READ_HEADER_TIMEOUT", "fast")
	defer func() {
		if r := recover(); r == nil || !strings.Contains(fmt.Sprint(r), "BORGO_READ_HEADER_TIMEOUT") {
			t.Fatalf("want actionable panic, got %v", r)
		}
	}()
	newServer("3501", nil)
}

func TestSlowHeadersAreCutOff(t *testing.T) {
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Config.ReadHeaderTimeout = 150 * time.Millisecond
	srv.Start()
	defer srv.Close()

	c, err := net.Dial("tcp", strings.TrimPrefix(srv.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	// a slowloris client: opens the request and never finishes the headers
	fmt.Fprint(c, "GET / HTTP/1.1\r\nHost: x\r\n")
	c.SetReadDeadline(time.Now().Add(3 * time.Second))
	buf := make([]byte, 1)
	start := time.Now()
	_, readErr := c.Read(buf)
	if readErr == nil {
		t.Fatal("connection must be closed, got data")
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("connection not cut off by the header timeout (waited %v)", elapsed)
	}
}

func TestSSEOutlivesWriteTimeout(t *testing.T) {
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		stream, err := SSE(w, r)
		if err != nil {
			return
		}
		for i := 0; i < 3; i++ {
			time.Sleep(200 * time.Millisecond)
			if stream.Send("tick", i) != nil {
				return
			}
		}
	}))
	// far shorter than the stream: without the deadline reset in SSE the
	// connection dies before the second event
	srv.Config.WriteTimeout = 100 * time.Millisecond
	srv.Start()
	defer srv.Close()

	res, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	events := 0
	scanner := bufio.NewScanner(res.Body)
	for scanner.Scan() {
		if strings.HasPrefix(scanner.Text(), "event: tick") {
			events++
		}
	}
	if events != 3 {
		t.Fatalf("want 3 events through the write timeout, got %d", events)
	}
}

func TestBindCapsBodies(t *testing.T) {
	type payload struct {
		Data string `json:"data"`
	}
	big := `{"data":"` + strings.Repeat("x", bindLimit) + `"}`
	small := `{"data":"ok"}`

	t.Run("oversized body is a 413", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(big))
		_, err := Bind[payload](r)
		if err == nil {
			t.Fatal("want error for oversized body")
		}
		w := httptest.NewRecorder()
		BindError(w, err)
		if w.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("want 413, got %d", w.Code)
		}
	})

	t.Run("small body decodes", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(small))
		v, err := Bind[payload](r)
		if err != nil || v.Data != "ok" {
			t.Fatalf("bind failed: %v %+v", err, v)
		}
	})

	t.Run("malformed body is a 400", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("not json"))
		_, err := Bind[payload](r)
		w := httptest.NewRecorder()
		BindError(w, err)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("want 400, got %d", w.Code)
		}
	})

	t.Run("BindMax overrides the cap", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(big))
		if _, err := BindMax[payload](r, int64(len(big))+1); err != nil {
			t.Fatalf("raised cap must decode: %v", err)
		}
		r = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(small))
		if _, err := BindMax[payload](r, 4); err == nil {
			t.Fatal("tiny cap must reject")
		}
		r = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(big))
		if _, err := BindMax[payload](r, 0); err != nil {
			t.Fatalf("0 disables the cap: %v", err)
		}
	})
}
