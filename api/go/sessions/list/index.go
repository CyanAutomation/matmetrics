package handler

import (
	"net/http"
	"strings"

	"matmetrics/pkg/githubapi"
	"matmetrics/pkg/httpapi"
	"matmetrics/pkg/model"
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
	if config.Owner == "" || config.Repo == "" {
		httpapi.WriteError(w, http.StatusBadRequest, "Missing owner or repo")
		return
	}

	client, err := githubapi.NewClientFromEnv()
	if err != nil {
		httpapi.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	sessions, err := client.ListSessions(config)
	if err != nil {
		httpapi.WriteError(w, http.StatusInternalServerError, "Failed to list sessions")
		return
	}

	httpapi.WriteJSON(w, http.StatusOK, sessions)
}

func readConfigFromQuery(r *http.Request) model.GitHubConfig {
	query := r.URL.Query()
	return model.GitHubConfig{
		Owner:  strings.TrimSpace(query.Get("owner")),
		Repo:   strings.TrimSpace(query.Get("repo")),
		Branch: strings.TrimSpace(query.Get("branch")),
	}
}
