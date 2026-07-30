package borgo

import (
	"fmt"
	"net/http"
	"time"
)

// Cache marks the response publicly cacheable for maxAge. An optional
// staleWhileRevalidate window lets proxies serve stale content while they
// refresh in the background. A response that already carries Set-Cookie is
// marked private instead, so shared caches never store it.
func Cache(w http.ResponseWriter, maxAge time.Duration, staleWhileRevalidate ...time.Duration) {
	scope := "public"
	if len(w.Header().Values("Set-Cookie")) > 0 {
		scope = "private"
	}
	value := fmt.Sprintf("%s, max-age=%d", scope, clampSeconds(maxAge))
	if len(staleWhileRevalidate) > 0 {
		value += fmt.Sprintf(", stale-while-revalidate=%d", clampSeconds(staleWhileRevalidate[0]))
	}
	w.Header().Set("Cache-Control", value)
}

func clampSeconds(d time.Duration) int {
	if d < 0 {
		return 0
	}
	return int(d.Seconds())
}

// NoCache marks the response as never cacheable - right for anything
// personalized or session-dependent.
func NoCache(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
}
