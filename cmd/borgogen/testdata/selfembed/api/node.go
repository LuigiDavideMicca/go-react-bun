package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

// Node embeds itself: encoding/json stops at the first level, since the
// promoted copy of X would be shadowed by the outer one anyway.
type Node struct {
	*Node
	X int `json:"x"`
}

//borgo:route GET /api/node
func GetNode(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Node{})
}
