package main

import (
	"github.com/LuigiDavideMicca/borgo"

	"tasks/api"
	"tasks/db"
)

func main() {
	db.Connect()
	db.Migrate(&api.Task{})
	borgo.Serve()
}
