package main

import (
	"github.com/LuigiDavideMicca/borgo"

	_ "{{name}}/api"
)

func main() {
	borgo.Serve()
}
