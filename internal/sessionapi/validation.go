package sessionapi

import (
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"strings"
	"time"

	"matmetrics/internal/model"
)

// TODO(P4): Validation logic is duplicated between this Go backend and
// src/app/api/sessions/[id]/route.ts (TypeScript). With P6 (dual backend
// support), both paths exist. See:
// https://github.com/CyanAutomation/matmetrics/issues/XXX
// A future refactor should consolidate validation into a shared layer or
// remove the TypeScript-side validation entirely when Go is the primary
// backend for session mutations.

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

	// NOTE(P1): DNS-level SSRF checks were intentionally moved to connection
	// time. The caller must use DialSSRFSafe (or an equivalent Dialer) when
	// fetching the video URL so that DNS resolution happens after the TCP
	// dial decision and private-IP filtering is applied to the resolved
	// address. Do not re-add net.LookupIP checks at validation time.

	return nil
}

func isDisallowedIP(addr netip.Addr) bool {
	return addr.IsLoopback() ||
		addr.IsPrivate() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsMulticast() ||
		addr.IsUnspecified()
}
