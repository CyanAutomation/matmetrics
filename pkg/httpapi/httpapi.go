package httpapi

import (
	"net/http"

	internalhttpapi "matmetrics/internal/httpapi"
)

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	internalhttpapi.WriteJSON(w, status, payload)
}

func WriteError(w http.ResponseWriter, status int, message string) {
	internalhttpapi.WriteError(w, status, message)
}

func DecodeJSON(r *http.Request, target any) error {
	return internalhttpapi.DecodeJSON(r, target)
}

func MethodNotAllowed(w http.ResponseWriter, allowed string) {
	internalhttpapi.MethodNotAllowed(w, allowed)
}

func RequireAuthenticatedUser(w http.ResponseWriter, r *http.Request) bool {
	return internalhttpapi.RequireAuthenticatedUser(w, r)
}