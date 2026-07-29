package borgo

import (
	"compress/gzip"
	"net/http"
	"strings"
)

// responses below this many bytes ship identity: the gzip header would eat
// most of the saving
const gzipMinBytes = 1024

// gzipMiddleware compresses responses when the client accepts gzip. Small
// responses stay identity, event streams and pre-encoded responses pass
// through, and Flush keeps working so SSE and streamed handlers are unhurt.
func gzipMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !acceptsGzip(r.Header.Get("Accept-Encoding")) {
			next.ServeHTTP(w, r)
			return
		}
		gw := &gzipResponseWriter{rw: w}
		defer gw.finish()
		next.ServeHTTP(gw, r)
	})
}

func acceptsGzip(acceptEncoding string) bool {
	for _, part := range strings.Split(acceptEncoding, ",") {
		token, quality, hasQ := strings.Cut(strings.TrimSpace(part), ";")
		name := strings.TrimSpace(token)
		if name != "gzip" && name != "*" {
			continue
		}
		if hasQ && strings.TrimSpace(quality) == "q=0" {
			continue
		}
		return true
	}
	return false
}

// gzipResponseWriter holds the status and buffers the first kilobyte, so the
// compress-or-not decision is made before any header reaches the client.
type gzipResponseWriter struct {
	rw          http.ResponseWriter
	status      int
	buf         []byte
	gz          *gzip.Writer
	passthrough bool
}

func (g *gzipResponseWriter) Header() http.Header { return g.rw.Header() }

// Unwrap lets http.ResponseController reach the underlying writer.
func (g *gzipResponseWriter) Unwrap() http.ResponseWriter { return g.rw }

func (g *gzipResponseWriter) WriteHeader(status int) {
	if g.status != 0 {
		return
	}
	g.status = status
	h := g.rw.Header()
	if strings.HasPrefix(h.Get("Content-Type"), "text/event-stream") || h.Get("Content-Encoding") != "" {
		g.startPassthrough()
	}
}

func (g *gzipResponseWriter) Write(p []byte) (int, error) {
	if g.status == 0 {
		g.WriteHeader(http.StatusOK)
	}
	if g.passthrough {
		return g.rw.Write(p)
	}
	if g.gz != nil {
		return g.gz.Write(p)
	}
	g.buf = append(g.buf, p...)
	if len(g.buf) >= gzipMinBytes {
		g.startGzip()
	}
	return len(p), nil
}

// Flush lets streamed handlers deliver progressively: an active gzip writer
// is sync-flushed, a still-buffering response is committed as identity.
func (g *gzipResponseWriter) Flush() {
	if g.status == 0 {
		g.status = http.StatusOK
	}
	if g.gz != nil {
		g.gz.Flush()
	} else if !g.passthrough {
		g.startPassthrough()
	}
	if f, ok := g.rw.(http.Flusher); ok {
		f.Flush()
	}
}

func (g *gzipResponseWriter) startGzip() {
	h := g.rw.Header()
	// sniff before compressing: net/http would otherwise see gzip bytes
	if h.Get("Content-Type") == "" {
		h.Set("Content-Type", http.DetectContentType(g.buf))
	}
	h.Del("Content-Length")
	h.Set("Content-Encoding", "gzip")
	h.Add("Vary", "Accept-Encoding")
	g.rw.WriteHeader(g.status)
	g.gz = gzip.NewWriter(g.rw)
	g.gz.Write(g.buf)
	g.buf = nil
}

func (g *gzipResponseWriter) startPassthrough() {
	g.passthrough = true
	g.rw.WriteHeader(g.status)
	if len(g.buf) > 0 {
		g.rw.Write(g.buf)
		g.buf = nil
	}
}

func (g *gzipResponseWriter) finish() {
	if g.gz != nil {
		g.gz.Close()
		return
	}
	if g.passthrough {
		return
	}
	if g.status == 0 {
		g.status = http.StatusOK
	}
	g.rw.WriteHeader(g.status)
	if len(g.buf) > 0 {
		g.rw.Write(g.buf)
	}
}
