package handler

import (
	"net/http"

	"matmetrics/internal/githubapi"
	"matmetrics/internal/httpapi"
	"matmetrics/internal/model"
)

type deleteRequest struct {
	ID     string             `json:"id"`
	Config model.GitHubConfig `json:"config"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		httpapi.MethodNotAllowed(w, http.MethodDelete)
		return
	}

	var request deleteRequest
	if err := httpapi.DecodeJSON(r, &request); err != nil {
		httpapi.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if request.Config.Owner == "" || request.Config.Repo == "" {
		httpapi.WriteError(w, http.StatusBadRequest, "Missing owner or repo")
		return
	}

	client, err := githubapi.NewClientFromEnv()
	if err != nil {
		httpapi.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := client.DeleteSessionByID(request.Config, request.ID); err != nil {
		httpapi.WriteError(w, http.StatusInternalServerError, "Failed to delete session")
		return
	}

	httpapi.WriteJSON(w, http.StatusOK, map[string]string{"message": "Session deleted"})
}
