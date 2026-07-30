package api

import "net/http"

type Server struct{}

//borgo:route GET /api/m
func (Server) Handle(w http.ResponseWriter, r *http.Request) {}
