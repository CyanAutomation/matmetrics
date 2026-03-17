package handler

import (
	"net/http"
	"os"
	"strings"

	"matmetrics/pkg/githubapi"
	"matmetrics/pkg/httpapi"
	"matmetrics/pkg/model"
	"matmetrics/pkg/storage"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpapi.MethodNotAllowed(w, http.MethodPost)
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

	sessions, err := storage.ListSessions(dataDir())
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false,
			"message": "Bulk sync failed: " + err.Error(),
		})
		return
	}

	result, err := client.SyncAll(config, sessions)
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false,
			"message": "Bulk sync failed: " + err.Error(),
		})
		return
	}

	status := http.StatusOK
	if !result.Success {
		status = http.StatusInternalServerError
	}
	httpapi.WriteJSON(w, status, result)
}

func dataDir() string {
	if value := strings.TrimSpace(os.Getenv("MATMETRICS_DATA_DIR")); value != "" {
		return value
	}
	return "data"
}
