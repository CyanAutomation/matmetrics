package handler

import (
	"net/http"

	"matmetrics/pkg/githubapi"
	"matmetrics/pkg/httpapi"
	"matmetrics/pkg/model"
	"matmetrics/pkg/sessionapi"
)

type sessionRequest struct {
	Session model.Session      `json:"session"`
	Config  model.GitHubConfig `json:"config"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		httpapi.MethodNotAllowed(w, http.MethodPut)
		return
	}

	if !httpapi.RequireAuthenticatedUser(w, r) {
		return
	}

	var request sessionRequest
	if err := httpapi.DecodeJSON(r, &request); err != nil {
		httpapi.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if request.Config.Owner == "" || request.Config.Repo == "" {
		httpapi.WriteError(w, http.StatusBadRequest, "Missing owner or repo")
		return
	}
	if err := sessionapi.ValidateSession(request.Session); err != nil {
		httpapi.WriteError(w, http.StatusBadRequest, capitalizeFirst(err.Error()))
		return
	}

	client, err := githubapi.NewClientFromEnv()
	if err != nil {
		httpapi.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, err := client.UpdateSession(request.Config, request.Session)
	if err != nil {
		httpapi.WriteError(w, http.StatusInternalServerError, "Failed to update session")
		return
	}

	httpapi.WriteJSON(w, http.StatusOK, session)
}

func capitalizeFirst(value string) string {
	if value == "" {
		return value
	}
	if value[0] >= 'a' && value[0] <= 'z' {
		return string(value[0]-32) + value[1:]
	}
	return value
}
