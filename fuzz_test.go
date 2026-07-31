package borgo

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// FuzzGetSession throws arbitrary Cookie headers at the session parser. Two
// properties: it never panics, and it never accepts a session whose cookie
// value is not exactly one this server signed - anything else the fuzzer
// could construct that verifies would be an HMAC forgery or a parser bypass.
func FuzzGetSession(f *testing.F) {
	os.Setenv("SESSION_SECRET", "fuzz-secret-fuzz-secret-fuzz-secret")
	envelope, err := json.Marshal(sessionEnvelope{Exp: 1 << 40, Data: json.RawMessage(`{"user":"luigi"}`)})
	if err != nil {
		f.Fatal(err)
	}
	payload := base64.RawURLEncoding.EncodeToString(envelope)
	valid := payload + "." + sessionSign(payload)

	f.Add("borgo_session=" + valid)
	f.Add("borgo_session=" + valid + "; borgo_session=" + valid)
	f.Add("borgo_session=" + payload + ".AAAA")
	f.Add("borgo_session=junk; borgo_session=" + valid)
	f.Add("borgo_session=." + sessionSign(""))
	f.Add("borgo_session=" + strings.Repeat("a", sessionCookieMaxLen+1) + ".sig")
	f.Add("other=1; borgo_session=nodothere")
	f.Fuzz(func(t *testing.T, header string) {
		os.Setenv("SESSION_SECRET", "fuzz-secret-fuzz-secret-fuzz-secret")
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("Cookie", header)
		if _, ok := GetSession[map[string]any](r); ok {
			issued := 0
			for _, c := range r.CookiesNamed(sessionCookie) {
				if c.Value == valid {
					issued++
				}
			}
			if issued != 1 {
				t.Fatalf("accepted a session this server did not issue exactly once: %q", header)
			}
		}
	})
}

// FuzzSSEFrame checks that no event name or payload can smuggle an extra
// frame: a well-formed frame carries exactly one blank-line terminator, at
// the end, and no carriage returns.
func FuzzSSEFrame(f *testing.F) {
	f.Add("tick", "hello")
	f.Add("multi\nline", "x")
	f.Add("cr\rname", "x")
	f.Add("", "data: fake\n\nevent: forged")
	f.Fuzz(func(t *testing.T, event, data string) {
		frame, err := sseFrame(event, data)
		if strings.ContainsAny(event, "\r\n") {
			if err == nil {
				t.Fatalf("event %q with newlines must be rejected", event)
			}
			return
		}
		if err != nil {
			t.Fatalf("sseFrame(%q, %q): %v", event, data, err)
		}
		if !bytes.HasSuffix(frame, []byte("\n\n")) {
			t.Fatalf("frame not terminated: %q", frame)
		}
		if bytes.Contains(frame[:len(frame)-2], []byte("\n\n")) || bytes.ContainsRune(frame, '\r') {
			t.Fatalf("frame smuggles an extra terminator: %q", frame)
		}
		if bytes.Count(frame, []byte("\n")) != 3 {
			t.Fatalf("frame has stray newlines: %q", frame)
		}
	})
}

// FuzzBindMax feeds arbitrary bodies and content types through the decoder;
// it must error or decode, never panic, at any limit.
func FuzzBindMax(f *testing.F) {
	f.Add("application/json", []byte(`{"a":1}`), int64(64))
	f.Add("application/json; charset=utf-8", []byte(`{"a":1}{"b":2}`), int64(0))
	f.Add("text/plain", []byte(`{}`), int64(-1))
	f.Add("", []byte(`null`), int64(1))
	f.Add("application/json", []byte("{\"a\":"+strings.Repeat(" ", 64)+"1}"), int64(8))
	f.Fuzz(func(t *testing.T, ct string, body []byte, limit int64) {
		r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
		if ct != "" {
			r.Header.Set("Content-Type", ct)
		}
		_, _ = BindMax[map[string]any](r, limit)
	})
}
