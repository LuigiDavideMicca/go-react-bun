package api

import (
	"bytes"
	"encoding/json"
	"net/http"
)

type Export struct {
	Payload string `json:"payload"`
}

type Draft struct {
	Scratch string `json:"scratch"`
}

//borgo:route GET /api/export
func ExportWidgets(w http.ResponseWriter, r *http.Request) {
	var buf bytes.Buffer
	json.NewEncoder(&buf).Encode(Draft{Scratch: "not a response"})
	json.NewEncoder(w).Encode(Export{Payload: buf.String()})
}
