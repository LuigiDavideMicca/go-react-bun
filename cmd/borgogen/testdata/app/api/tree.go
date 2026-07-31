package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type Category struct {
	Name     string     `json:"name"`
	Children []Category `json:"children,omitempty"`
	Parent   *Category  `json:"parent"`
}

//borgo:route GET /api/categories
func Categories(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, []Category{})
}
