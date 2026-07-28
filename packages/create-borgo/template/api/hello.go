package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type Greeting struct {
	Message string `json:"message"`
}

//borgo:route GET /api/hello
func Hello(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Greeting{Message: "hello from go"})
}

//borgo:route GET /api/hello/{name}
func HelloName(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Greeting{Message: "hello, " + r.PathValue("name")})
}

type GreetRequest struct {
	Name string `json:"name"`
}

// the request body is typed end to end: borgogen reads T from borgo.Bind
// and the ts api client requires a matching `body`
//
//borgo:route POST /api/hello
func Greet(w http.ResponseWriter, r *http.Request) {
	body, err := borgo.Bind[GreetRequest](r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	borgo.JSON(w, http.StatusOK, Greeting{Message: "hello, " + body.Name})
}
