package githubapi

import internalgithubapi "matmetrics/internal/githubapi"

type Client = internalgithubapi.Client
type ValidateResult = internalgithubapi.ValidateResult
type SyncAllResult = internalgithubapi.SyncAllResult
type DiagnoseLogsSummary = internalgithubapi.DiagnoseLogsSummary
type DiagnoseLogsFileResult = internalgithubapi.DiagnoseLogsFileResult
type DiagnoseLogsResult = internalgithubapi.DiagnoseLogsResult

func NewClientFromEnv() (*Client, error) {
	return internalgithubapi.NewClientFromEnv()
}
