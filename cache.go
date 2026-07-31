package borgo

import (
	"fmt"
	"net/http"
	"time"
)

// Cache marks the response publicly cacheable for maxAge. An optional
// staleWhileRevalidate window lets proxies serve stale content while they
// refresh in the background. A response that already carries Set-Cookie is
// marked private instead, so shared caches never store it - which means
// calling Cache before SetSession skips that check: set cookies first.
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

// clampSeconds converts a duration to whole seconds without going through a
// platform-sized int: on 32-bit, int(d.Seconds()) of a >68-year duration
// overflows into an implementation-defined value (typically negative), turning
// the header into garbage. int64 holds any duration's seconds exactly.
func clampSeconds(d time.Duration) int64 {
	if d < 0 {
		return 0
	}
	return int64(d / time.Second)
}

// NoCache marks the response as never cacheable - right for anything
// personalized or session-dependent.
func NoCache(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
}
