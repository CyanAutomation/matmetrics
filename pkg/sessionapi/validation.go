package sessionapi

import (
	"matmetrics/internal/model"
	internalsessionapi "matmetrics/internal/sessionapi"
)

func ValidateSession(session model.Session) error {
	return internalsessionapi.ValidateSession(session)
}