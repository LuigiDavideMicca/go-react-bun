package borgo

import (
	"net/http"
	"strings"
	"testing"
)

func TestHandleValidation(t *testing.T) {
	ok := func(http.ResponseWriter, *http.Request) {}
	cases := []struct {
		name      string
		pattern   string
		handler   http.HandlerFunc
		wantPanic string
	}{
		{"valid", "GET /api/ok", ok, ""},
		{"valid with param", "DELETE /api/ok/{id}", ok, ""},
		{"missing method", "/api/x", ok, "pattern must be"},
		{"lowercase method", "get /api/x", ok, "pattern must be"},
		{"no space", "GET/api/x", ok, "pattern must be"},
		{"path without slash", "GET api/x", ok, "pattern must be"},
		{"nil handler", "GET /api/nil", nil, "nil handler"},
		{"duplicate", "GET /api/ok", ok, "registered twice"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			defer func() {
				r := recover()
				if c.wantPanic == "" {
					if r != nil {
						t.Fatalf("unexpected panic: %v", r)
					}
					return
				}
				msg, _ := r.(string)
				if r == nil || !strings.Contains(msg, c.wantPanic) {
					t.Fatalf("want panic containing %q, got %v", c.wantPanic, r)
				}
			}()
			Handle(c.pattern, c.handler)
		})
	}
}
