package sessionapi

import (
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strings"
	"time"

	"matmetrics/internal/model"
	"matmetrics/internal/networkvalidator"
)

const maxSessionIDLength = 100

var safeSessionIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func ValidateSession(session model.Session) error {
	if err := validateSessionID(session.ID); err != nil {
		return err
	}
	if strings.TrimSpace(session.Date) == "" {
		return fmt.Errorf("missing required field: date")
	}
	if !regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`).MatchString(session.Date) {
		return fmt.Errorf("Invalid date: expected YYYY-MM-DD format")
	}
	if _, err := time.Parse("2006-01-02", session.Date); err != nil {
		return fmt.Errorf("Invalid date: must be a real calendar date")
	}
	if session.Effort < 1 || session.Effort > 5 {
		return fmt.Errorf("Invalid effort level (must be an integer 1-5)")
	}
	switch session.Category {
	case model.CategoryTechnical, model.CategoryRandori, model.CategoryShiai, model.CategoryCardio, model.CategoryStrengthConditioning:
	default:
		return fmt.Errorf("Invalid category")
	}
	for index, technique := range session.Techniques {
		if strings.TrimSpace(technique) == "" {
			return fmt.Errorf("Invalid techniques[%d]: value cannot be empty", index)
		}
	}
	if session.Duration != nil && *session.Duration < 0 {
		return fmt.Errorf("Invalid duration: expected a non-negative integer")
	}
	if err := validateOptionalVideoURL(session.VideoURL); err != nil {
		return err
	}
	return nil
}

func validateSessionID(value string) error {
	trimmedID := strings.TrimSpace(value)
	if trimmedID == "" {
		return fmt.Errorf("missing required field: id")
	}
	if len(trimmedID) > maxSessionIDLength {
		return fmt.Errorf("invalid id: exceeds maximum length of %d characters", maxSessionIDLength)
	}
	if !safeSessionIDPattern.MatchString(trimmedID) {
		return fmt.Errorf("invalid id: contains invalid characters; only letters, digits, \"-\" and \"_\" are allowed")
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
		return fmt.Errorf("Invalid videoUrl: expected a valid absolute URL")
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return fmt.Errorf("Invalid videoUrl: protocol must be http or https")
	}
	if isDisallowedVideoHost(parsedURL.Hostname()) {
		return fmt.Errorf("Invalid videoUrl: private or internal network addresses are not allowed")
	}
	return nil
}

var lookupIP = net.LookupIP

func isDisallowedVideoHost(host string) bool {
	return networkvalidator.IsDisallowedVideoHost(host, lookupIP)
}
