package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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

	force := r.URL.Query().Get("force") == "1"

	sessions, cacheOutcome, err := client.ListSessionsWithCacheOutcome(config, force)
	if err != nil {
		httpapi.WriteError(w, http.StatusInternalServerError, "Failed to list sessions")
		return
	}

	writeSessionListResponse(w, r, sessions, cacheOutcome)
}

func writeSessionListResponse(w http.ResponseWriter, r *http.Request, sessions []model.Session, cacheOutcome string) {
	body, err := json.Marshal(sessions)
	if err != nil {
		httpapi.WriteError(w, http.StatusInternalServerError, "Failed to encode sessions")
		return
	}
	digest := sha256.Sum256(body)
	etag := `"` + hex.EncodeToString(digest[:]) + `"`

	w.Header().Set("Cache-Control", "private, no-cache, must-revalidate")
	w.Header().Set("ETag", etag)
	w.Header().Set("Vary", "Authorization")
	w.Header().Set("Content-Type", "application/json")
	if cacheOutcome == "hit" || cacheOutcome == "miss" || cacheOutcome == "coalesced" || cacheOutcome == "forced" {
		w.Header().Set("X-Matmetrics-Session-Cache", cacheOutcome)
	}
	if r.URL.Query().Get("force") != "1" && ifNoneMatchMatches(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func ifNoneMatchMatches(header, etag string) bool {
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || candidate == etag {
			return true
		}
		if strings.HasPrefix(candidate, "W/") && strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}

func readConfigFromQuery(r *http.Request) model.GitHubConfig {
	query := r.URL.Query()
	return model.GitHubConfig{
		Owner:  strings.TrimSpace(query.Get("owner")),
		Repo:   strings.TrimSpace(query.Get("repo")),
		Branch: strings.TrimSpace(query.Get("branch")),
	}
}
