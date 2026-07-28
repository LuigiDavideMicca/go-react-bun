package api

import "net/http"

//borgo:route GET /api/things
func One(w http.ResponseWriter, r *http.Request) {}

//borgo:route GET /api/things
func Two(w http.ResponseWriter, r *http.Request) {}
