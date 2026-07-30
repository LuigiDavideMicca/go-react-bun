package api

import "net/http"

//borgo:route GET /api/g
func Handle[T any](w http.ResponseWriter, r *http.Request) {}
