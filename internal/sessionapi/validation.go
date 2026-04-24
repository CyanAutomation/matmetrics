package sessionapi

import (
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"regexp"
	"strings"
	"time"

	"matmetrics/internal/model"
)

const maxSessionIDLength = 100

var safeSessionIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

// TODO(P4): Validation logic is duplicated between this Go backend and
// src/app/api/sessions/[id]/route.ts (TypeScript). With P6 (dual backend
// support), both paths exist. See:
// https://github.com/CyanAutomation/matmetrics/issues/XXX
// A future refactor should consolidate validation into a shared layer or
// remove the TypeScript-side validation entirely when Go is the primary
// backend for session mutations.

func ValidateSession(session model.Session) error {
	if err := validateSessionID(session.ID); err != nil {
		return err
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
	if session.Duration != nil && *session.Duration < 0 {
		return fmt.Errorf("invalid duration: expected a non-negative integer")
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
	if value == "" {
		return nil
	}
	if trimmed == "" {
		return fmt.Errorf("invalid videoUrl: expected a valid absolute URL")
	}

	parsedURL, err := url.Parse(trimmed)
	if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
		return fmt.Errorf("invalid videoUrl: expected a valid absolute URL")
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return fmt.Errorf("invalid videoUrl: protocol must be http or https")
	}

	host := parsedURL.Hostname()
	if isDisallowedVideoHost(host) {
		return fmt.Errorf("invalid videoUrl: private or internal network addresses are not allowed")
	}

	return nil
}

var lookupIP = net.LookupIP

func isDisallowedVideoHost(host string) bool {
	lowerHost := strings.ToLower(strings.TrimSpace(host))
	if lowerHost == "" || lowerHost == "localhost" {
		return true
	}

	if ip, err := netip.ParseAddr(lowerHost); err == nil {
		return isDisallowedIP(ip)
	}

	resolvedIPs, err := lookupIP(lowerHost)
	if err != nil {
		return true
	}
	for _, resolvedIP := range resolvedIPs {
		addr, ok := netip.AddrFromSlice(resolvedIP)
		if ok && isDisallowedIP(addr) {
			return true
		}
	}
	return false
}

func isDisallowedIP(addr netip.Addr) bool {
	return addr.IsLoopback() ||
		addr.IsPrivate() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsMulticast() ||
		addr.IsUnspecified()
}
