package borgo

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"time"
)

const sessionCookie = "borgo_session"

type sessionEnvelope struct {
	Exp  int64           `json:"exp"`
	Data json.RawMessage `json:"data"`
}

func sessionSecret() []byte {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		panic("borgo: SESSION_SECRET must be set to use sessions (any long random string)")
	}
	return []byte(secret)
}

func sessionSign(payload string) string {
	mac := hmac.New(sha256.New, sessionSecret())
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// SetSession stores v, JSON-encoded and HMAC-signed with SESSION_SECRET, in
// an http-only cookie. The expiry is signed too, so a client cannot extend
// it. Set SESSION_SECURE=1 to add the Secure attribute behind https.
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
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    payload + "." + sessionSign(payload),
		Path:     "/",
		MaxAge:   int(maxAge.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   os.Getenv("SESSION_SECURE") == "1",
	})
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
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func splitLast(s string, sep byte) (string, string, bool) {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == sep {
			return s[:i], s[i+1:], true
		}
	}
	return "", "", false
}
