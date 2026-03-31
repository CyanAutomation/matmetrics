package storage

import (
	"matmetrics/internal/model"
	internalstorage "matmetrics/internal/storage"
)

func ListSessions(dataDir string) ([]model.Session, error) {
	return internalstorage.ListSessions(dataDir)
}