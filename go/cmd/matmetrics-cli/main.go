package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"matmetrics/internal/githubapi"
	"matmetrics/internal/model"
	"matmetrics/internal/storage"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) < 2 {
		return usageError()
	}

	switch args[0] {
	case "github":
		return runGitHub(args[1:])
	case "sessions":
		return runSessions(args[1:])
	default:
		return usageError()
	}
}

func runGitHub(args []string) error {
	if len(args) == 0 {
		return usageError()
	}

	switch args[0] {
	case "validate":
		fs := flag.NewFlagSet("github validate", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		owner := fs.String("owner", "", "GitHub owner")
		repo := fs.String("repo", "", "GitHub repository")
		branch := fs.String("branch", "", "GitHub branch")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		config, err := buildGitHubConfig(*owner, *repo, *branch)
		if err != nil {
			return err
		}
		client, err := githubapi.NewClientFromEnv()
		if err != nil {
			return err
		}
		result, err := client.Validate(config)
		if err != nil {
			return err
		}
		return writeJSON(result)
	case "sync-all":
		fs := flag.NewFlagSet("github sync-all", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		dataDir := fs.String("data-dir", "data", "Session data directory")
		owner := fs.String("owner", "", "GitHub owner")
		repo := fs.String("repo", "", "GitHub repository")
		branch := fs.String("branch", "", "GitHub branch")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		config, err := buildGitHubConfig(*owner, *repo, *branch)
		if err != nil {
			return err
		}
		sessions, err := storage.ListSessions(*dataDir)
		if err != nil {
			return err
		}
		client, err := githubapi.NewClientFromEnv()
		if err != nil {
			return err
		}
		result, err := client.SyncAll(config, sessions)
		if err != nil {
			return err
		}
		return writeJSON(result)
	default:
		return usageError()
	}
}

func runSessions(args []string) error {
	if len(args) == 0 {
		return usageError()
	}

	switch args[0] {
	case "list":
		fs := flag.NewFlagSet("sessions list", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		dataDir := fs.String("data-dir", "data", "Session data directory")
		format := fs.String("format", "json", "Output format")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if *format != "json" {
			return fmt.Errorf("unsupported format %q", *format)
		}
		sessions, err := storage.ListSessions(*dataDir)
		if err != nil {
			return err
		}
		return writeJSON(sessions)
	default:
		return usageError()
	}
}

func buildGitHubConfig(owner string, repo string, branch string) (model.GitHubConfig, error) {
	if owner == "" || repo == "" {
		return model.GitHubConfig{}, fmt.Errorf("owner and repo are required")
	}
	return model.GitHubConfig{
		Owner:  owner,
		Repo:   repo,
		Branch: branch,
	}, nil
}

func writeJSON(v any) error {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(v)
}

func usageError() error {
	return fmt.Errorf("usage: matmetrics-cli <github validate|github sync-all|sessions list> [flags]")
}
