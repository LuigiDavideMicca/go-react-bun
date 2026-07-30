package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type Page[T any] struct {
	Items []T `json:"items"`
	Total int `json:"total"`
}

type Widget struct {
	Name string `json:"name"`
}

type Post struct {
	Title string `json:"title"`
}

//borgo:route GET /api/widgets
func Widgets(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Page[Widget]{})
}

//borgo:route GET /api/posts
func Posts(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Page[Post]{})
}
