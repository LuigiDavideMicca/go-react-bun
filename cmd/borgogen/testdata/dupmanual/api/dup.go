package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type A struct {
	A int `json:"a"`
}

type B struct {
	B string `json:"b"`
}

func first(w http.ResponseWriter, r *http.Request)  { borgo.JSON(w, http.StatusOK, A{}) }
func second(w http.ResponseWriter, r *http.Request) { borgo.JSON(w, http.StatusOK, B{}) }

func init() {
	borgo.Handle("GET /api/x", first)
	borgo.Handle("GET /api/x", second)
}
