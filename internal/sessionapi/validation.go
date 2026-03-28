package sessionapi

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"matmetrics/internal/model"
)

func ValidateSession(session model.Session) error {
	if strings.TrimSpace(session.ID) == "" {
		return fmt.Errorf("missing required field: id")
	}
	if strings.TrimSpace(session.Date) == "" {
		return fmt.Errorf("missing required field: date")
	}
	if _, err := time.Parse("2006-01-02", session.Date); err != nil {
		return fmt.Errorf("invalid date: must be a real calendar date")
	}
	if len(session.Date) != 10 {
		return fmt.Errorf("invalid date: must be a real calendar date")
	}
	if session.Effort < 1 || session.Effort > 5 {
		return fmt.Errorf("invalid effort level (must be 1-5)")
	}
	switch session.Category {
	case model.CategoryTechnical, model.CategoryRandori, model.CategoryShiai:
	default:
		return fmt.Errorf("invalid category")
	}
	for index, technique := range session.Techniques {
		if strings.TrimSpace(technique) == "" {
			return fmt.Errorf("invalid techniques[%d]: value cannot be empty", index)
		}
	}
	if err := validateOptionalVideoURL(session.VideoURL); err != nil {
		return err
	}
	return nil
}

func validateOptionalVideoURL(value string) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}

	parsedURL, err := url.Parse(trimmed)
	if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
		return fmt.Errorf("invalid videoUrl: expected a valid absolute URL")
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return fmt.Errorf("invalid videoUrl: protocol must be http or https")
	}

	// Prevent SSRF attacks by blocking private/internal network ranges
	host := parsedURL.Hostname()
	if host == "localhost" || host == "127.0.0.1" || host == "::1" ||
		strings.HasPrefix(host, "10.") ||
		strings.HasPrefix(host, "172.16.") || strings.HasPrefix(host, "172.17.") ||
		strings.HasPrefix(host, "172.18.") || strings.HasPrefix(host, "172.19.") ||
		strings.HasPrefix(host, "172.20.") || strings.HasPrefix(host, "172.21.") ||
		strings.HasPrefix(host, "172.22.") || strings.HasPrefix(host, "172.23.") ||
		strings.HasPrefix(host, "172.24.") || strings.HasPrefix(host, "172.25.") ||
		strings.HasPrefix(host, "172.26.") || strings.HasPrefix(host, "172.27.") ||
		strings.HasPrefix(host, "172.28.") || strings.HasPrefix(host, "172.29.") ||
		strings.HasPrefix(host, "172.30.") || strings.HasPrefix(host, "172.31.") ||
		strings.HasPrefix(host, "192.168.") ||
		host == "169.254.169.254" { // AWS/GCP metadata
		return fmt.Errorf("invalid videoUrl: private or internal network addresses are not allowed")
	}

	return nil

	return nil
}
