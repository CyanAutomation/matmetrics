package sessionapi

import (
	internalmodel "matmetrics/internal/model"
	internalsessionapi "matmetrics/internal/sessionapi"
)

func ValidateSession(session internalmodel.Session) error {
	return internalsessionapi.ValidateSession(session)
}
