package githubapi

import internalgithubapi "matmetrics/internal/githubapi"

type Client = internalgithubapi.Client
type ValidateResult = internalgithubapi.ValidateResult
type SyncAllResult = internalgithubapi.SyncAllResult
type DiagnoseLogsSummary = internalgithubapi.DiagnoseLogsSummary
type DiagnoseLogsFileResult = internalgithubapi.DiagnoseLogsFileResult
type DiagnoseLogsResult = internalgithubapi.DiagnoseLogsResult
type LogDoctorFixMode = internalgithubapi.LogDoctorFixMode
type LogDoctorFixOptions = internalgithubapi.LogDoctorFixOptions
type LogDoctorFixRequest = internalgithubapi.LogDoctorFixRequest
type LogDoctorFixValidationState = internalgithubapi.LogDoctorFixValidationState
type LogDoctorFixPreview = internalgithubapi.LogDoctorFixPreview
type LogDoctorFixFileResult = internalgithubapi.LogDoctorFixFileResult
type LogDoctorFixResult = internalgithubapi.LogDoctorFixResult

const (
	LogDoctorFixModeDryRun = internalgithubapi.LogDoctorFixModeDryRun
	LogDoctorFixModeApply  = internalgithubapi.LogDoctorFixModeApply
)

func NewClientFromEnv() (*Client, error) {
	return internalgithubapi.NewClientFromEnv()
}