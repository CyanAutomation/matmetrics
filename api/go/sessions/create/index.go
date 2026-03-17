package main

import (
	"net/http"

	"matmetrics/internal/githubapi"
	"matmetrics/internal/httpapi"
	"matmetrics/internal/model"
)

type sessionRequest struct {
	Session model.Session      `json:"session"`
	Config  model.GitHubConfig `json:"config"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpapi.MethodNotAllowed(w, http.MethodPost)
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

	client, err := githubapi.NewClientFromEnv()
	if err != nil {
		httpapi.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, err := client.CreateSession(request.Config, request.Session)
	if err != nil {
		httpapi.WriteError(w, http.StatusInternalServerError, "Failed to create session")
		return
	}

	httpapi.WriteJSON(w, http.StatusCreated, session)
}
