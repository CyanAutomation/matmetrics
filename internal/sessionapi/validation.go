package sessionapi

import (
	"fmt"
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
	return nil
}
