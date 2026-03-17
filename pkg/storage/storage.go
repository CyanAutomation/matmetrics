package storage

import (
	internalmodel "matmetrics/internal/model"
	internalstorage "matmetrics/internal/storage"
)

func ListSessions(dataDir string) ([]internalmodel.Session, error) {
	return internalstorage.ListSessions(dataDir)
}
