package githubapi

import internalgithubapi "matmetrics/internal/githubapi"

type Client = internalgithubapi.Client
type ValidateResult = internalgithubapi.ValidateResult
type SyncAllResult = internalgithubapi.SyncAllResult

func NewClientFromEnv() (*Client, error) {
	return internalgithubapi.NewClientFromEnv()
}
