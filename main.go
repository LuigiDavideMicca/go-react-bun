package main

import (
	"log"
	"net/http"
	"os"

	"go-react-bun/api"
	"go-react-bun/db"
)

func main() {
	db.Connect()
	db.Migrate(api.Models...)

	mux := http.NewServeMux()
	for pattern, handler := range api.Routes {
		mux.HandleFunc(pattern, handler)
	}

	port := os.Getenv("API_PORT")
	if port == "" {
		port = "3501"
	}

	log.Println("api listening on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
