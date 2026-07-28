package borgo

import (
	"fmt"
	"net/http"
	"time"
)

// Cache marks the response publicly cacheable for maxAge. An optional
// staleWhileRevalidate window lets proxies serve stale content while they
// refresh in the background.
func Cache(w http.ResponseWriter, maxAge time.Duration, staleWhileRevalidate ...time.Duration) {
	value := fmt.Sprintf("public, max-age=%d", int(maxAge.Seconds()))
	if len(staleWhileRevalidate) > 0 {
		value += fmt.Sprintf(", stale-while-revalidate=%d", int(staleWhileRevalidate[0].Seconds()))
	}
	w.Header().Set("Cache-Control", value)
}

// NoCache marks the response as never cacheable - right for anything
// personalized or session-dependent.
func NoCache(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
}
