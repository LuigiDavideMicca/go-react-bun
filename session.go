package borgo

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"hash"
	"net/http"
	"os"
	"sync"
	"time"
)

const (
	sessionCookie = "borgo_session"
	// browsers silently drop cookies over 4 KB, which would surface as a
	// login loop of 200 responses
	sessionCookieMaxLen = 4096
)

func newSessionCookie() *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookie,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   os.Getenv("SESSION_SECURE") == "1",
	}
}

type sessionEnvelope struct {
	Exp  int64           `json:"exp"`
	Data json.RawMessage `json:"data"`
}

func sessionSecret() string {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		panic("borgo: SESSION_SECRET must be set to use sessions (any long random string)")
	}
	return secret
}

// building an hmac is most of the cost of verifying a session, and every
// guarded request verifies one. Pooled macs are rebuilt only when the secret
// changes, so rotating SESSION_SECRET still takes effect immediately.
type sessionSigner struct {
	secret string
	mac    hash.Hash
	buf    []byte
	sum    []byte
}

var sessionSigners sync.Pool

func sessionSign(payload string) string {
	secret := sessionSecret()
	s, _ := sessionSigners.Get().(*sessionSigner)
	if s == nil || s.secret != secret {
		s = &sessionSigner{secret: secret, mac: hmac.New(sha256.New, []byte(secret))}
	}
	s.mac.Reset()
	s.buf = append(s.buf[:0], payload...)
	s.mac.Write(s.buf)
	s.sum = s.mac.Sum(s.sum[:0])
	sig := base64.RawURLEncoding.EncodeToString(s.sum)
	sessionSigners.Put(s)
	return sig
}

// SetSession stores v, JSON-encoded and HMAC-signed with SESSION_SECRET, in
// an http-only cookie. The expiry is signed too, so a client cannot extend
// it. Set SESSION_SECURE=1 to add the Secure attribute behind https. A
// maxAge of zero or less writes an already-expired session.
func SetSession(w http.ResponseWriter, v any, maxAge time.Duration) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	envelope, err := json.Marshal(sessionEnvelope{Exp: time.Now().Add(maxAge).Unix(), Data: data})
	if err != nil {
		return err
	}
	payload := base64.RawURLEncoding.EncodeToString(envelope)
	cookie := newSessionCookie()
	cookie.Value = payload + "." + sessionSign(payload)
	cookie.MaxAge = int(maxAge.Seconds())
	if n := len(cookie.String()); n > sessionCookieMaxLen {
		return fmt.Errorf("borgo: session cookie is %d bytes, over the %d-byte browser limit; store a smaller principal (see Auth.Principal)", n, sessionCookieMaxLen)
	}
	http.SetCookie(w, cookie)
	return nil
}

// GetSession verifies the session cookie's signature and expiry and decodes
// its payload into T. The second return is false for a missing, tampered or
// expired session.
func GetSession[T any](r *http.Request) (T, bool) {
	var zero T
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return zero, false
	}
	payload, sig, ok := splitLast(cookie.Value, '.')
	if !ok || !hmac.Equal([]byte(sessionSign(payload)), []byte(sig)) {
		return zero, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return zero, false
	}
	var envelope sessionEnvelope
	if json.Unmarshal(raw, &envelope) != nil || time.Now().Unix() > envelope.Exp {
		return zero, false
	}
	var v T
	if json.Unmarshal(envelope.Data, &v) != nil {
		return zero, false
	}
	return v, true
}

// ClearSession deletes the session cookie.
func ClearSession(w http.ResponseWriter) {
	cookie := newSessionCookie()
	cookie.MaxAge = -1
	http.SetCookie(w, cookie)
}

func splitLast(s string, sep byte) (string, string, bool) {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == sep {
			return s[:i], s[i+1:], true
		}
	}
	return "", "", false
}
