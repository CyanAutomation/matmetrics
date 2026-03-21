package githubapi

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"

	"matmetrics/internal/markdown"
	"matmetrics/internal/model"
	"matmetrics/internal/storage"
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

type gitHubTreeEntry struct {
	Path string `json:"path"`
	Type string `json:"type"`
}

type gitHubContentsEntry struct {
	Path string `json:"path"`
	Type string `json:"type"`
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

	if strings.TrimSpace(config.Branch) != "" {
		if _, err := c.apiRequest(http.MethodGet, fmt.Sprintf("/repos/%s/%s/branches/%s", config.Owner, config.Repo, encodePathSegments(branch)), nil); err != nil {
			return ValidateResult{Success: false, Message: err.Error()}, nil
		}
	}

	return ValidateResult{
		Success: true,
		Message: fmt.Sprintf("Successfully connected to %s/%s on branch %s", config.Owner, config.Repo, branch),
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

func (c *Client) ListSessions(config model.GitHubConfig) ([]model.Session, error) {
	branch, err := c.resolveBranch(config)
	if err != nil {
		return nil, err
	}

	paths, err := c.listGitHubSessionPaths(config, branch)
	if err != nil {
		return nil, err
	}

	sessions := make([]model.Session, 0, len(paths))
	for _, path := range paths {
		_, content, err := c.getFile(config, path, branch)
		if err != nil {
			return nil, err
		}
		session, err := markdown.MarkdownToSession(content)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}

	slices.SortFunc(sessions, func(a, b model.Session) int {
		switch {
		case a.Date > b.Date:
			return -1
		case a.Date < b.Date:
			return 1
		default:
			return 0
		}
	})

	return sessions, nil
}

func (c *Client) ReadSessionByID(config model.GitHubConfig, id string) (*model.Session, error) {
	path, branch, err := c.findSessionPathOnGitHubByID(config, id)
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil
	}

	_, content, err := c.getFile(config, path, branch)
	if err != nil {
		return nil, err
	}

	session, err := markdown.MarkdownToSession(content)
	if err != nil {
		return nil, err
	}

	return &session, nil
}

func (c *Client) CreateSession(config model.GitHubConfig, session model.Session) (*model.Session, error) {
	branch, err := c.resolveBranch(config)
	if err != nil {
		return nil, err
	}

	outcome, err := c.upsertSession(config, branch, session)
	if err != nil {
		return nil, err
	}
	if outcome != "pushed" && outcome != "skipped" {
		return nil, fmt.Errorf("unexpected create outcome %q", outcome)
	}

	return &session, nil
}

func (c *Client) UpdateSession(config model.GitHubConfig, session model.Session) (*model.Session, error) {
	branch, err := c.resolveBranch(config)
	if err != nil {
		return nil, err
	}

	if _, err := c.upsertSession(config, branch, session); err != nil {
		return nil, err
	}

	return &session, nil
}

func (c *Client) DeleteSessionByID(config model.GitHubConfig, sessionID string) error {
	branch, err := c.resolveBranch(config)
	if err != nil {
		return err
	}

	path, _, err := c.findSessionPathOnGitHubByID(config, sessionID)
	if err != nil {
		return err
	}
	if path == "" {
		return nil
	}

	sha, _, err := c.getFile(config, path, branch)
	if err != nil {
		if apiErr, ok := err.(*gitHubAPIError); ok && apiErr.Status == http.StatusNotFound {
			return nil
		}
		return err
	}

	_, err = c.apiRequest(http.MethodDelete, fmt.Sprintf("/repos/%s/%s/contents/%s", config.Owner, config.Repo, encodePathSegments(path)), map[string]any{
		"message": fmt.Sprintf("Delete session by id: %s", sessionID),
		"branch":  branch,
		"sha":     sha,
	})
	return err
}

const (
	gitHubSessionRoot = "data"
)

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
	return fmt.Sprintf("%s/%s/%s/%s", gitHubSessionRoot, parts[0], parts[1], fileName), nil
}

func (c *Client) findSessionPathOnGitHubByID(config model.GitHubConfig, sessionID string) (string, string, error) {
	branch, err := c.resolveBranch(config)
	if err != nil {
		return "", "", err
	}

	suffixIDs, err := storage.SessionIDPathSuffixCandidates(sessionID)
	if err != nil {
		return "", "", err
	}

	suffixes := make([]string, 0, len(suffixIDs))
	for _, suffixID := range suffixIDs {
		suffixes = append(suffixes, "-matmetrics-"+suffixID+".md")
	}

	entries, err := c.getTreeEntriesForPath(config, branch, gitHubSessionRoot)
	if err != nil {
		return "", "", err
	}

	for _, entry := range entries {
		if entry.Type != "blob" {
			continue
		}
		for _, suffix := range suffixes {
			if strings.HasSuffix(entry.Path, suffix) {
				return entry.Path, branch, nil
			}
		}
	}

	return "", branch, nil
}

func (c *Client) listGitHubSessionPaths(config model.GitHubConfig, branch string) ([]string, error) {
	entries, err := c.getTreeEntriesForPath(config, branch, gitHubSessionRoot)
	if err != nil {
		return nil, err
	}

	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.Type == "blob" && strings.HasPrefix(entry.Path, gitHubSessionRoot+"/") && strings.HasSuffix(entry.Path, ".md") {
			paths = append(paths, entry.Path)
		}
	}
	return paths, nil
}

func (c *Client) getTreeEntriesForPath(config model.GitHubConfig, branch string, rootPath string) ([]gitHubTreeEntry, error) {
	refPayload, err := c.apiRequest(http.MethodGet, fmt.Sprintf("/repos/%s/%s/git/ref/heads/%s", config.Owner, config.Repo, encodePathSegments(branch)), nil)
	if err != nil {
		apiErr, ok := err.(*gitHubAPIError)
		if !ok || apiErr.Status != http.StatusNotFound {
			return nil, err
		}
		return []gitHubTreeEntry{}, nil
	}

	var refResponse struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := json.Unmarshal(refPayload, &refResponse); err != nil {
		return nil, err
	}

	commitPayload, err := c.apiRequest(http.MethodGet, fmt.Sprintf("/repos/%s/%s/git/commits/%s", config.Owner, config.Repo, refResponse.Object.SHA), nil)
	if err != nil {
		return nil, err
	}

	var commitResponse struct {
		Tree struct {
			SHA string `json:"sha"`
		} `json:"tree"`
	}
	if err := json.Unmarshal(commitPayload, &commitResponse); err != nil {
		return nil, err
	}

	treePayload, err := c.apiRequest(http.MethodGet, fmt.Sprintf("/repos/%s/%s/git/trees/%s?recursive=1", config.Owner, config.Repo, commitResponse.Tree.SHA), nil)
	if err != nil {
		return nil, err
	}

	var treeResponse struct {
		Truncated bool              `json:"truncated"`
		Tree      []gitHubTreeEntry `json:"tree"`
	}
	if err := json.Unmarshal(treePayload, &treeResponse); err != nil {
		return nil, err
	}

	if treeResponse.Truncated {
		return c.listTreeEntriesFromContentsAPI(config, branch, rootPath)
	}

	prefix := strings.TrimRight(rootPath, "/") + "/"
	filtered := make([]gitHubTreeEntry, 0, len(treeResponse.Tree))
	for _, entry := range treeResponse.Tree {
		if strings.HasPrefix(entry.Path, prefix) {
			filtered = append(filtered, entry)
		}
	}

	return filtered, nil
}

func (c *Client) listTreeEntriesFromContentsAPI(config model.GitHubConfig, branch string, rootPath string) ([]gitHubTreeEntry, error) {
	queue := []string{strings.Trim(rootPath, "/")}
	entries := make([]gitHubTreeEntry, 0)

	for len(queue) > 0 {
		currentPath := queue[0]
		queue = queue[1:]

		payload, err := c.apiRequest(http.MethodGet, fmt.Sprintf("/repos/%s/%s/contents/%s?ref=%s", config.Owner, config.Repo, encodePathSegments(currentPath), url.QueryEscape(branch)), nil)
		if err != nil {
			if apiErr, ok := err.(*gitHubAPIError); ok && apiErr.Status == http.StatusNotFound && currentPath == strings.Trim(rootPath, "/") {
				return []gitHubTreeEntry{}, nil
			}
			return nil, err
		}

		var contents []gitHubContentsEntry
		if err := json.Unmarshal(payload, &contents); err != nil {
			return nil, err
		}

		for _, entry := range contents {
			if entry.Type == "dir" {
				queue = append(queue, entry.Path)
				entries = append(entries, gitHubTreeEntry{Path: entry.Path, Type: "tree"})
				continue
			}
			if entry.Type == "file" {
				entries = append(entries, gitHubTreeEntry{Path: entry.Path, Type: "blob"})
			}
		}
	}

	return entries, nil
}

func (c *Client) upsertSession(config model.GitHubConfig, branch string, session model.Session) (string, error) {
	filePath, err := SessionGitHubPath(session)
	if err != nil {
		return "", err
	}

	rendered, err := markdown.SessionToMarkdown(session)
	if err != nil {
		return "", err
	}

	existingPath := filePath
	existingSHA, existingContent, err := c.getFile(config, filePath, branch)
	if err != nil {
		if apiErr, ok := err.(*gitHubAPIError); ok && apiErr.Status == http.StatusNotFound {
			existingSHA = ""
			existingContent = ""
		} else {
			return "", err
		}
	}

	if existingSHA == "" {
		discoveredPath, _, err := c.findSessionPathOnGitHubByID(config, session.ID)
		if err != nil {
			return "", err
		}
		if discoveredPath != "" && discoveredPath != filePath {
			existingPath = discoveredPath
			existingSHA, existingContent, err = c.getFile(config, discoveredPath, branch)
			if err != nil {
				if apiErr, ok := err.(*gitHubAPIError); !ok || apiErr.Status != http.StatusNotFound {
					return "", err
				}
				existingSHA = ""
				existingContent = ""
			}
		}
	}

	if existingSHA != "" && existingContent == rendered && existingPath == filePath {
		return "skipped", nil
	}

	body := map[string]any{
		"message": fmt.Sprintf("Sync session: %s", session.Date),
		"content": base64.StdEncoding.EncodeToString([]byte(rendered)),
		"branch":  branch,
	}
	if existingSHA != "" && existingPath == filePath {
		body["sha"] = existingSHA
	}

	_, err = c.apiRequest(http.MethodPut, fmt.Sprintf("/repos/%s/%s/contents/%s", config.Owner, config.Repo, encodePathSegments(filePath)), body)
	if err != nil {
		return "", err
	}

	if existingSHA != "" && existingPath != filePath {
		_, err = c.apiRequest(http.MethodDelete, fmt.Sprintf("/repos/%s/%s/contents/%s", config.Owner, config.Repo, encodePathSegments(existingPath)), map[string]any{
			"message": fmt.Sprintf("Move session: %s", session.Date),
			"branch":  branch,
			"sha":     existingSHA,
		})
		if err != nil {
			return "", err
		}
	}

	return "pushed", nil
}

func (c *Client) getFile(config model.GitHubConfig, filePath string, branch string) (sha string, content string, err error) {
	path := fmt.Sprintf("/repos/%s/%s/contents/%s?ref=%s", config.Owner, config.Repo, encodePathSegments(filePath), url.QueryEscape(branch))
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

func encodePathSegments(path string) string {
	if path == "" {
		return ""
	}

	segments := strings.Split(path, "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}

	return strings.Join(segments, "/")
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
	req.Header.Set("User-Agent", "matmetrics")
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
