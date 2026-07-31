package main

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
		`"GET /api/health": { response: Health };`,
		"status: string",
		"detail?: string",
		`"GET /api/export": { response: Export };`,
		`"GET /api/mixed": { response: Widget | Deleted };`,
		`"GET /api/widgets": { response: WidgetList };`,
		`"POST /api/widgets": { response: Widget; request: WidgetCreate };`,
		`"DELETE /api/widgets/{id}": { response: Deleted };`,
		`"GET /api/widgets/{id}": { response: Widget };`,
		`"PUT /api/widgets/{id}": { response: Widget; request: WidgetCreate };`,
		`"GET /api/manual": { response: string };`,
		`"GET /api/secret": { response: Deleted };`,
		"created: string",
		"tags?: Array<string>",
		"price: string",
		"notes: string | null",
		"attrs: Record<string, number>",
		"raw: unknown",
		"counts: Record<string, string>",
		"flags: unknown",
		`"GET /api/categories": { response: Array<Category> };`,
		"children?: Array<Category>",
		"parent: Category | null",
		`"GET /api/health/full": { response: FullHealth };`,
		"uptime: number",
		"interface WsEvents {",
		`"widgets/created": Widget;`,
		`"widgets/deleted": number | string;`,
	}
	for _, want := range wantTypes {
		if !strings.Contains(types, want) {
			t.Errorf("api-types.d.ts missing %q\n%s", want, types)
		}
	}
	if strings.Contains(types, "Secret") || strings.Contains(types, "hidden") {
		t.Errorf("unexported or json:\"-\" fields leaked:\n%s", types)
	}
	if strings.Contains(types, "ErrResp") {
		t.Errorf("error-status payloads must stay out of the response union; the ts client throws on non-2xx:\n%s", types)
	}
	if strings.Contains(types, "Draft") || strings.Contains(types, "Scratch") {
		t.Errorf("an encoder aimed at a non-ResponseWriter must not become a response type:\n%s", types)
	}

	wantGen := []string{
		`borgo.Handle("GET /api/health", HealthCheck)`,
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

func TestWriteIfChangedBumpsMtimeWhenIdentical(t *testing.T) {
	path := filepath.Join(t.TempDir(), "out.ts")
	if err := os.WriteFile(path, []byte("same"), 0o644); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-time.Hour)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}

	writeIfChanged(path, "same")

	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if !fi.ModTime().After(old.Add(30 * time.Minute)) {
		t.Errorf("mtime not bumped: still %v", fi.ModTime())
	}
	if read(t, path) != "same" {
		t.Errorf("content must be untouched")
	}
}

func TestGenerateErrors(t *testing.T) {
	cases := []struct{ name, dir, want string }{
		{"duplicate pattern", "dup", "already registered"},
		{"malformed type directive", "badtype", "malformed directive"},
		{"directive on non-handler", "badsig", "not a func(http.ResponseWriter"},
		{"pattern without method", "nospace", `want "METHOD /path"`},
		{"directive on method", "method", "package-level"},
		{"directive on generic function", "genericfn", "type parameters"},
		{"dynamic push topic", "badpush", "constant topic and event"},
		{"slash in push topic", "slashpush", `must not contain "/"`},
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

func TestInvalidDirectiveWritesNoMounting(t *testing.T) {
	root := filepath.Join("testdata", "nospace")
	if err := run(root); err == nil {
		t.Fatal("want an error")
	}
	if _, err := os.Stat(filepath.Join(root, "api", "borgo.gen.go")); !os.IsNotExist(err) {
		t.Errorf("borgo.gen.go must not be written for an invalid directive")
	}
}

func TestStaleGeneratedMountingRecovers(t *testing.T) {
	root := filepath.Join("testdata", "stalegen")
	genPath := filepath.Join(root, "api", "borgo.gen.go")
	good := read(t, genPath)
	stale := strings.Replace(good, "borgo.Handle(\"GET /api/ping\", Ping)", "borgo.Handle(\"GET /api/gone\", DeletedHandler)", 1)
	if stale == good {
		t.Fatal("fixture does not contain the expected mounting line")
	}
	if err := os.WriteFile(genPath, []byte(stale), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.WriteFile(genPath, []byte(good), 0o644) })

	if err := run(root); err != nil {
		t.Fatalf("stale borgo.gen.go must not fail the run: %v", err)
	}
	if read(t, genPath) != good {
		t.Errorf("borgo.gen.go not regenerated:\n%s", read(t, genPath))
	}
}

func TestGenericInstantiationsStayDistinct(t *testing.T) {
	root := filepath.Join("testdata", "generics")
	if err := run(root); err != nil {
		t.Fatal(err)
	}
	types := read(t, filepath.Join(root, ".borgo", "api-types.d.ts"))
	for _, want := range []string{
		"export interface PageWidget {",
		"export interface PagePost {",
		"items: Array<Widget>",
		"items: Array<Post>",
		`"GET /api/widgets": { response: PageWidget };`,
		`"GET /api/posts": { response: PagePost };`,
	} {
		if !strings.Contains(types, want) {
			t.Errorf("api-types.d.ts missing %q\n%s", want, types)
		}
	}
}

func TestSameNameStructsInDifferentPackagesStayDistinct(t *testing.T) {
	root := filepath.Join("testdata", "collide")
	if err := run(root); err != nil {
		t.Fatal(err)
	}
	types := read(t, filepath.Join(root, ".borgo", "api-types.d.ts"))
	for _, want := range []string{
		"export interface Status {",
		"export interface LibStatus {",
		"ok: boolean",
		"ready: boolean",
		`"GET /api/local": { response: Status };`,
		`"GET /api/remote": { response: LibStatus };`,
	} {
		if !strings.Contains(types, want) {
			t.Errorf("api-types.d.ts missing %q\n%s", want, types)
		}
	}
}

func TestLooseRouteCommentWarns(t *testing.T) {
	old := os.Stderr
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stderr = w
	runErr := run(filepath.Join("testdata", "loose"))
	w.Close()
	os.Stderr = old
	out, _ := io.ReadAll(r)

	if runErr != nil {
		t.Fatal(runErr)
	}
	if !strings.Contains(string(out), "not attached to a handler") {
		t.Errorf("want a loose-directive warning on stderr, got:\n%s", out)
	}
	if !strings.Contains(string(out), "loose.go:9") {
		t.Errorf("want file:line in the warning, got:\n%s", out)
	}
}

func TestSlashPushErrorCarriesPosition(t *testing.T) {
	err := run(filepath.Join("testdata", "slashpush"))
	if err == nil || !strings.Contains(err.Error(), "bad.go:6") {
		t.Fatalf("want file:line in the error, got %v", err)
	}
}
