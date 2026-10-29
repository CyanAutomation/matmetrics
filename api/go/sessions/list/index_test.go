package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"matmetrics/internal/model"
)

func TestWriteSessionListResponseEmitsPrivateETag(t *testing.T) {
	sessions := []model.Session{{ID: "session-1"}}
	recorder := httptest.NewRecorder()
	writeSessionListResponse(recorder, httptest.NewRequest(http.MethodGet, "/", nil), sessions, "miss")

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "private, no-cache, must-revalidate" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if got := recorder.Header().Get("Vary"); got != "Authorization" {
		t.Fatalf("Vary = %q", got)
	}
	if got := recorder.Header().Get("X-Matmetrics-Session-Cache"); got != "miss" {
		t.Fatalf("cache outcome header = %q, want miss", got)
	}
	if got := recorder.Header().Get("ETag"); len(got) != 66 || got[0] != '"' || got[len(got)-1] != '"' {
		t.Fatalf("ETag = %q, want quoted SHA-256", got)
	}
	var decoded []model.Session
	if err := json.Unmarshal(recorder.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("response JSON is invalid: %v", err)
	}
	if len(decoded) != 1 || decoded[0].ID != "session-1" {
		t.Fatalf("response sessions = %#v", decoded)
	}
}

func TestWriteSessionListResponseReturnsNotModifiedForMatchingETag(t *testing.T) {
	sessions := []model.Session{{ID: "session-1"}}
	first := httptest.NewRecorder()
	writeSessionListResponse(first, httptest.NewRequest(http.MethodGet, "/", nil), sessions, "miss")

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("If-None-Match", `"old", `+first.Header().Get("ETag"))
	recorder := httptest.NewRecorder()
	writeSessionListResponse(recorder, request, sessions, "hit")

	if recorder.Code != http.StatusNotModified {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotModified)
	}
	if recorder.Body.Len() != 0 {
		t.Fatalf("304 response body = %q, want empty", recorder.Body.String())
	}
	if got := recorder.Header().Get("ETag"); got != first.Header().Get("ETag") {
		t.Fatalf("ETag = %q, want %q", got, first.Header().Get("ETag"))
	}
	if got := recorder.Header().Get("X-Matmetrics-Session-Cache"); got != "hit" {
		t.Fatalf("cache outcome header = %q, want hit", got)
	}
}

func TestWriteSessionListResponseReturnsNotModifiedForWildcard(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("If-None-Match", "*")
	recorder := httptest.NewRecorder()
	writeSessionListResponse(recorder, request, []model.Session{}, "miss")

	if recorder.Code != http.StatusNotModified {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotModified)
	}
}

func TestWriteSessionListResponseHonorsForcedRefreshOverValidator(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/?force=1", nil)
	request.Header.Set("If-None-Match", "*")
	recorder := httptest.NewRecorder()
	writeSessionListResponse(recorder, request, []model.Session{}, "forced")

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
}
