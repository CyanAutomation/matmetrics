package handler

import (
	"net/http"
	"path"
	"strings"

	"matmetrics/pkg/githubapi"
	"matmetrics/pkg/httpapi"
	"matmetrics/pkg/model"
)

type logDoctorFixClient interface {
	FixLogs(config model.GitHubConfig, request githubapi.LogDoctorFixRequest) (githubapi.LogDoctorFixResult, error)
}

var newGitHubClient = func() (logDoctorFixClient, error) {
	return githubapi.NewClientFromEnv()
}

type fixRequestBody struct {
	Owner        string                        `json:"owner"`
	Repo         string                        `json:"repo"`
	Branch       string                        `json:"branch"`
	Mode         githubapi.LogDoctorFixMode    `json:"mode"`
	Paths        []string                      `json:"paths"`
	Options      githubapi.LogDoctorFixOptions `json:"options"`
	ConfirmApply bool                          `json:"confirmApply"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpapi.MethodNotAllowed(w, http.MethodPost)
		return
	}

	if !httpapi.RequireAuthenticatedUser(w, r) {
		return
	}

	var body fixRequestBody
	if err := httpapi.DecodeJSON(r, &body); err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"message": "Invalid request body",
		})
		return
	}

	config := model.GitHubConfig{
		Owner:  strings.TrimSpace(body.Owner),
		Repo:   strings.TrimSpace(body.Repo),
		Branch: strings.TrimSpace(body.Branch),
	}
	if config.Owner == "" || config.Repo == "" {
		httpapi.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"message": "Missing owner or repo",
		})
		return
	}

	if body.Mode != githubapi.LogDoctorFixModeDryRun && body.Mode != githubapi.LogDoctorFixModeApply {
		httpapi.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"message": "Invalid mode",
		})
		return
	}
	if len(body.Paths) == 0 {
		httpapi.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"message": "At least one file path is required",
		})
		return
	}
	for _, selectedPath := range body.Paths {
		if !isSafeLogDoctorPath(selectedPath) {
			httpapi.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"success": false,
				"message": "Invalid file path",
			})
			return
		}
	}
	if body.Mode == githubapi.LogDoctorFixModeApply && !body.ConfirmApply {
		httpapi.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"message": "Apply mode requires explicit confirmation",
		})
		return
	}

	client, err := newGitHubClient()
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	result, err := client.FixLogs(config, githubapi.LogDoctorFixRequest{
		Mode:         body.Mode,
		Paths:        body.Paths,
		Options:      body.Options,
		ConfirmApply: body.ConfirmApply,
	})
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false,
			"message": "Log fix failed: " + err.Error(),
		})
		return
	}

	httpapi.WriteJSON(w, http.StatusOK, result)
}

func isSafeLogDoctorPath(filePath string) bool {
	trimmed := strings.TrimSpace(filePath)
	if trimmed == "" || strings.Contains(trimmed, "\x00") {
		return false
	}
	normalized := strings.ReplaceAll(trimmed, "\\", "/")
	if strings.HasPrefix(normalized, "/") || strings.HasSuffix(normalized, "/") {
		return false
	}
	if !strings.HasPrefix(normalized, "data/") || !strings.HasSuffix(normalized, ".md") {
		return false
	}
	if path.Clean(normalized) != normalized {
		return false
	}
	for _, segment := range strings.Split(normalized, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return false
		}
	}
	return true
}
