package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"matmetrics/internal/githubapi"
	"matmetrics/internal/model"
)

type stubLogDoctorFixClient struct {
	result githubapi.LogDoctorFixResult
	err    error
}

func (s stubLogDoctorFixClient) FixLogs(config model.GitHubConfig, request githubapi.LogDoctorFixRequest) (githubapi.LogDoctorFixResult, error) {
	if s.err != nil {
		return githubapi.LogDoctorFixResult{}, s.err
	}
	return s.result, nil
}

func TestHandlerValidationAndDryRun(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

	originalFactory := newGitHubClient
	t.Cleanup(func() {
		newGitHubClient = originalFactory
	})

	newGitHubClient = func() (logDoctorFixClient, error) {
		return stubLogDoctorFixClient{result: githubapi.LogDoctorFixResult{
			Success: true,
			Message: "dry-run completed for 1 file(s)",
			Branch:  "main",
			Mode:    githubapi.LogDoctorFixModeDryRun,
			Files:   []githubapi.LogDoctorFixFileResult{{Path: "data/2026/03/20260329-matmetrics-a.md", Status: "preview"}},
		}}, nil
	}

	tests := []struct {
		name           string
		body           map[string]any
		wantStatusCode int
		wantContains   string
	}{
		{
			name: "dry-run success",
			body: map[string]any{
				"owner": "octocat",
				"repo":  "hello-world",
				"mode":  "dry-run",
				"paths": []string{"data/2026/03/20260329-matmetrics-a.md"},
			},
			wantStatusCode: http.StatusOK,
			wantContains:   `"success":true`,
		},
		{
			name: "apply without confirmation rejected",
			body: map[string]any{
				"owner": "octocat",
				"repo":  "hello-world",
				"mode":  "apply",
				"paths": []string{"data/2026/03/20260329-matmetrics-a.md"},
			},
			wantStatusCode: http.StatusBadRequest,
			wantContains:   "Apply mode requires explicit confirmation",
		},
		{
			name: "empty path list rejected",
			body: map[string]any{
				"owner": "octocat",
				"repo":  "hello-world",
				"mode":  "dry-run",
				"paths": []string{},
			},
			wantStatusCode: http.StatusBadRequest,
			wantContains:   "At least one file path is required",
		},
		{
			name: "invalid mode rejected",
			body: map[string]any{
				"owner": "octocat",
				"repo":  "hello-world",
				"mode":  "preview",
				"paths": []string{"data/2026/03/20260329-matmetrics-a.md"},
			},
			wantStatusCode: http.StatusBadRequest,
			wantContains:   "Invalid mode",
		},
		{
			name: "unsafe path rejected",
			body: map[string]any{
				"owner": "octocat",
				"repo":  "hello-world",
				"mode":  "dry-run",
				"paths": []string{"../secrets.md"},
			},
			wantStatusCode: http.StatusBadRequest,
			wantContains:   "Invalid file path",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			payload, err := json.Marshal(tc.body)
			if err != nil {
				t.Fatalf("json.Marshal() error = %v", err)
			}

			request := httptest.NewRequest(http.MethodPost, "/api/go/github/log-doctor/fix", bytes.NewReader(payload))
			request.Header.Set("Authorization", "Bearer test-token")
			recorder := httptest.NewRecorder()

			Handler(recorder, request)

			if recorder.Code != tc.wantStatusCode {
				t.Fatalf("status = %d, want %d, body=%s", recorder.Code, tc.wantStatusCode, recorder.Body.String())
			}
			if got := recorder.Body.String(); !bytes.Contains([]byte(got), []byte(tc.wantContains)) {
				t.Fatalf("response body %q does not contain %q", got, tc.wantContains)
			}
		})
	}
}

func TestHandlerServiceFailure(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

	originalFactory := newGitHubClient
	t.Cleanup(func() {
		newGitHubClient = originalFactory
	})

	newGitHubClient = func() (logDoctorFixClient, error) {
		return stubLogDoctorFixClient{err: errors.New("upstream failure")}, nil
	}

	body := []byte(`{"owner":"octocat","repo":"hello-world","mode":"dry-run","paths":["data/2026/03/20260329-matmetrics-a.md"]}`)
	request := httptest.NewRequest(http.MethodPost, "/api/go/github/log-doctor/fix", bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
	if got := recorder.Body.String(); !bytes.Contains([]byte(got), []byte("Log fix failed: upstream failure")) {
		t.Fatalf("unexpected body: %s", got)
	}
}
