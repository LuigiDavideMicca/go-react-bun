package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func read(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestGenerateFixture(t *testing.T) {
	root := filepath.Join("testdata", "app")
	typesPath := filepath.Join(root, ".borgo", "api-types.d.ts")
	genPath := filepath.Join(root, "api", "borgo.gen.go")
	committedTypes := read(t, typesPath)
	committedGen := read(t, genPath)

	if err := run(root); err != nil {
		t.Fatal(err)
	}

	types := read(t, typesPath)
	gen := read(t, genPath)
	if types != committedTypes {
		t.Errorf("api-types.d.ts changed; the committed fixture snapshot is stale")
	}
	if gen != committedGen {
		t.Errorf("borgo.gen.go changed; the committed fixture snapshot is stale")
	}

	wantTypes := []string{
		`"GET /api/widgets": { response: WidgetList };`,
		`"POST /api/widgets": { response: Widget; request: WidgetCreate };`,
		`"DELETE /api/widgets/{id}": { response: Deleted };`,
		`"GET /api/manual": { response: string };`,
		"created: string",
		"tags?: Array<string>",
		"price: string",
		"notes: string | null",
		"attrs: Record<string, number>",
	}
	for _, want := range wantTypes {
		if !strings.Contains(types, want) {
			t.Errorf("api-types.d.ts missing %q\n%s", want, types)
		}
	}
	if strings.Contains(types, "Secret") || strings.Contains(types, "hidden") {
		t.Errorf("unexported or json:\"-\" fields leaked:\n%s", types)
	}

	wantGen := []string{
		`borgo.Handle("DELETE /api/widgets/{id}", DeleteWidget)`,
		`borgo.Handle("GET /api/widgets", ListWidgets)`,
		`borgo.Handle("POST /api/widgets", CreateWidget)`,
	}
	for _, want := range wantGen {
		if !strings.Contains(gen, want) {
			t.Errorf("borgo.gen.go missing %q\n%s", want, gen)
		}
	}
	if strings.Contains(gen, "manual") {
		t.Errorf("manually registered route must not be re-mounted:\n%s", gen)
	}
}

func TestGenerateErrors(t *testing.T) {
	cases := []struct{ name, dir, want string }{
		{"duplicate pattern", "dup", "already registered"},
		{"malformed type directive", "badtype", "malformed directive"},
		{"directive on non-handler", "badsig", "not a func(http.ResponseWriter"},
		{"missing api dir", "none", "no api/ directory"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := run(filepath.Join("testdata", c.dir))
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want error containing %q, got %v", c.want, err)
			}
		})
	}
}
