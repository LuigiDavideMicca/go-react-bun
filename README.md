# Go-React-Bun

Bun compiles and minifies React and Fe Code and the app is served via Go with be exposed on /api and fe exposed on /.

This is a proof of concept for a framework using go as backend language both for the api and for handling react. Bun is used as an alternative to node, as a package manager and also as a bundler minifing both react files and static files (included scss files).


## FE
```bash
cd fe
bun install
bun run dev
```

## BE

```bash
cd be
go run .
```