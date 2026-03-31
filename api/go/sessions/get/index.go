package handler

import (
	"net/http"
	"strings"

	"matmetrics/internal/githubapi"
	"matmetrics/internal/httpapi"
	"matmetrics/internal/model"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpapi.MethodNotAllowed(w, http.MethodGet)
		return
	}

	if !httpapi.RequireAuthenticatedUser(w, r) {
		return
	}

	config := readConfigFromQuery(r)
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if config.Owner == "" || config.Repo == "" {
		httpapi.WriteError(w, http.StatusBadRequest, "Missing owner or repo")
		return
	}
	if id == "" {
		httpapi.WriteError(w, http.StatusBadRequest, "Missing session id")
		return
	}

	client, err := githubapi.NewClientFromEnv()
	if err != nil {
		httpapi.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, err := client.ReadSessionByID(config, id)
	if err != nil {
		httpapi.WriteError(w, http.StatusInternalServerError, "Failed to retrieve session")
		return
	}
	if session == nil {
		httpapi.WriteError(w, http.StatusNotFound, "Session not found")
		return
	}

	httpapi.WriteJSON(w, http.StatusOK, session)
}

func readConfigFromQuery(r *http.Request) model.GitHubConfig {
	query := r.URL.Query()
	return model.GitHubConfig{
		Owner:  strings.TrimSpace(query.Get("owner")),
		Repo:   strings.TrimSpace(query.Get("repo")),
		Branch: strings.TrimSpace(query.Get("branch")),
	}
}
