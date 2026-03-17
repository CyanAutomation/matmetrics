package githubapi

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"matmetrics/go/internal/markdown"
	"matmetrics/go/internal/model"
	"matmetrics/go/internal/storage"
)

var apiBaseURL = "https://api.github.com"

type Client struct {
	BaseURL    string
	HTTPClient *http.Client
	Token      string
}

type ValidateResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Branch  string `json:"branch,omitempty"`
}

type SyncAllResult struct {
	Success bool     `json:"success"`
	Message string   `json:"message"`
	Branch  string   `json:"branch,omitempty"`
	Pushed  int      `json:"pushed"`
	Skipped int      `json:"skipped"`
	Failed  int      `json:"failed"`
	Errors  []string `json:"errors,omitempty"`
}

type gitHubAPIError struct {
	Status  int
	Message string
}

func (e *gitHubAPIError) Error() string {
	return fmt.Sprintf("GitHub API error %d: %s", e.Status, e.Message)
}

func NewClientFromEnv() (*Client, error) {
	token := strings.TrimSpace(os.Getenv("GITHUB_TOKEN"))
	if token == "" {
		return nil, fmt.Errorf("GITHUB_TOKEN environment variable not set")
	}

	return &Client{
		BaseURL:    apiBaseURL,
		HTTPClient: http.DefaultClient,
		Token:      token,
	}, nil
}

func (c *Client) Validate(config model.GitHubConfig) (ValidateResult, error) {
	branch, err := c.resolveBranch(config)
	if err != nil {
		return ValidateResult{Success: false, Message: err.Error()}, nil
	}

	if _, err := c.apiRequest(http.MethodGet, fmt.Sprintf("/repos/%s/%s", config.Owner, config.Repo), nil); err != nil {
		return ValidateResult{Success: false, Message: err.Error()}, nil
	}

	return ValidateResult{
		Success: true,
		Message: fmt.Sprintf("Connected to %s/%s", config.Owner, config.Repo),
		Branch:  branch,
	}, nil
}

func (c *Client) SyncAll(config model.GitHubConfig, sessions []model.Session) (SyncAllResult, error) {
	branch, err := c.resolveBranch(config)
	if err != nil {
		return SyncAllResult{}, err
	}

	result := SyncAllResult{
		Success: true,
		Message: fmt.Sprintf("Synced %d session(s) to %s/%s", len(sessions), config.Owner, config.Repo),
		Branch:  branch,
	}

	for _, session := range sessions {
		outcome, err := c.upsertSession(config, branch, session)
		if err != nil {
			result.Success = false
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", session.ID, err))
			continue
		}
		if outcome == "skipped" {
			result.Skipped++
			continue
		}
		result.Pushed++
	}

	if !result.Success {
		result.Message = fmt.Sprintf("Bulk sync completed with %d failure(s)", result.Failed)
	}

	return result, nil
}

func (c *Client) upsertSession(config model.GitHubConfig, branch string, session model.Session) (string, error) {
	filePath, err := SessionGitHubPath(session)
	if err != nil {
		return "", err
	}

	existingSHA, existingContent, err := c.getFile(config, filePath, branch)
	if err != nil {
		if apiErr, ok := err.(*gitHubAPIError); !ok || apiErr.Status != http.StatusNotFound {
			return "", err
		}
		existingSHA = ""
		existingContent = ""
	}

	rendered, err := markdown.SessionToMarkdown(session)
	if err != nil {
		return "", err
	}
	if existingSHA != "" && existingContent == rendered {
		return "skipped", nil
	}

	body := map[string]any{
		"message": fmt.Sprintf("Sync session: %s", session.Date),
		"content": base64.StdEncoding.EncodeToString([]byte(rendered)),
		"branch":  branch,
	}
	if existingSHA != "" {
		body["sha"] = existingSHA
	}

	_, err = c.apiRequest(http.MethodPut, fmt.Sprintf("/repos/%s/%s/contents/%s", config.Owner, config.Repo, filePath), body)
	if err != nil {
		return "", err
	}
	return "pushed", nil
}

func SessionGitHubPath(session model.Session) (string, error) {
	encodedID, err := storage.EncodedSessionID(session.ID)
	if err != nil {
		return "", err
	}

	parts := strings.Split(session.Date, "-")
	if len(parts) != 3 {
		return "", fmt.Errorf("invalid session date %q", session.Date)
	}

	fileName := fmt.Sprintf("%s%s%s-matmetrics-%s.md", parts[0], parts[1], parts[2], encodedID)
	return fmt.Sprintf("sessions/%s/%s/%s", parts[0], parts[1], fileName), nil
}

func (c *Client) getFile(config model.GitHubConfig, filePath string, branch string) (sha string, content string, err error) {
	path := fmt.Sprintf("/repos/%s/%s/contents/%s?ref=%s", config.Owner, config.Repo, filePath, branch)
	payload, err := c.apiRequest(http.MethodGet, path, nil)
	if err != nil {
		return "", "", err
	}

	var response struct {
		SHA     string `json:"sha"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(payload, &response); err != nil {
		return "", "", err
	}

	decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(response.Content, "\n", ""))
	if err != nil {
		return "", "", err
	}

	return response.SHA, string(decoded), nil
}

func (c *Client) resolveBranch(config model.GitHubConfig) (string, error) {
	if strings.TrimSpace(config.Branch) != "" {
		return strings.TrimSpace(config.Branch), nil
	}

	payload, err := c.apiRequest(http.MethodGet, fmt.Sprintf("/repos/%s/%s", config.Owner, config.Repo), nil)
	if err != nil {
		return "", err
	}

	var repo struct {
		DefaultBranch string `json:"default_branch"`
	}
	if err := json.Unmarshal(payload, &repo); err != nil {
		return "", err
	}
	if strings.TrimSpace(repo.DefaultBranch) == "" {
		return "", fmt.Errorf("repository default branch is unavailable")
	}

	return repo.DefaultBranch, nil
}

func (c *Client) apiRequest(method string, path string, body any) ([]byte, error) {
	baseURL := c.BaseURL
	if baseURL == "" {
		baseURL = apiBaseURL
	}
	httpClient := c.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		payload = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, baseURL+path, payload)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "token "+c.Token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "matmetrics-cli")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := resp.Status
		var errorPayload struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(raw, &errorPayload) == nil && strings.TrimSpace(errorPayload.Message) != "" {
			message = errorPayload.Message
		}
		return nil, &gitHubAPIError{Status: resp.StatusCode, Message: message}
	}

	return raw, nil
}
