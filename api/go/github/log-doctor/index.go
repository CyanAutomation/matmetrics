package handler

import (
	"net/http"
	"strings"

	"matmetrics/internal/githubapi"
	"matmetrics/internal/httpapi"
	"matmetrics/internal/model"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpapi.MethodNotAllowed(w, http.MethodPost)
		return
	}

	if !httpapi.RequireAuthenticatedUser(w, r) {
		return
	}

	var config model.GitHubConfig
	if err := httpapi.DecodeJSON(r, &config); err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"message": "Invalid request body",
		})
		return
	}

	config.Owner = strings.TrimSpace(config.Owner)
	config.Repo = strings.TrimSpace(config.Repo)
	config.Branch = strings.TrimSpace(config.Branch)
	if config.Owner == "" || config.Repo == "" {
		httpapi.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"message": "Missing owner or repo",
		})
		return
	}

	client, err := githubapi.NewClientFromEnv()
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	result, err := client.DiagnoseLogs(config)
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false,
			"message": "Log diagnosis failed: " + err.Error(),
		})
		return
	}

	httpapi.WriteJSON(w, http.StatusOK, result)
}
