package model

import internalmodel "matmetrics/internal/model"

type EffortLevel = internalmodel.EffortLevel
type SessionCategory = internalmodel.SessionCategory

const (
	CategoryTechnical = internalmodel.CategoryTechnical
	CategoryRandori   = internalmodel.CategoryRandori
	CategoryShiai     = internalmodel.CategoryShiai
)

type Session = internalmodel.Session
type GitHubConfig = internalmodel.GitHubConfig