---
name: plugin-manager
description: Manage plugin manifests and files. Use when users ask to create, update, list, or validate plugins and their metadata.
---

# Plugin Manager

Purpose: provide a consistent, safe workflow for creating, updating, listing, and validating plugins in this repository.

## Trigger Rules

Use this skill when the user asks to:
- create a new plugin scaffold or plugin manifest
- update an existing plugin definition, metadata, or compatibility fields
- list installed/available plugins or summarize plugin status
- validate plugin manifests, schemas, or plugin directory consistency

Do not use this skill for unrelated package management tasks unless the user explicitly frames them as plugin operations.

## Inputs to Collect

Collect these inputs before execution:
- action: `create` | `update` | `list` | `validate`
- plugin identifier (slug/name)
- target plugin path or root directory
- manifest format expectations (for example JSON schema/version)
- requested output detail level (brief table vs. full report)

Action-specific inputs:
- create: initial fields, template choice, optional defaults
- update: fields to change, merge strategy, compatibility constraints
- list: filtering/sorting criteria
- validate: validation scope (single plugin vs. all plugins)

Fallback when inputs are incomplete:
1. infer safe defaults from existing plugin files and repository conventions;
2. clearly state the assumptions made;
3. continue with a non-destructive dry-run style result when uncertainty remains;
4. include a short "what I still need" list for follow-up.

## Workflow

1. **Detect action**
   - map request to `create`, `update`, `list`, or `validate`
   - verify plugin root exists and inspect current structure

2. **Create**
   - confirm target plugin does not already exist
   - scaffold files from repository pattern
   - populate manifest with required keys and sensible defaults
   - run schema/structure validation and report results

3. **Update**
   - load current manifest and related files
   - apply minimal diff for requested changes
   - preserve unknown JSON keys and ordering where practical
   - revalidate updated plugin and summarize field-level deltas

4. **List**
   - enumerate plugin directories/manifests
   - collect key metadata (name, version, status, validation state)
   - present sorted results based on requested or default criteria

5. **Validate**
   - run structural + schema checks on target scope
   - detect missing required fields, invalid types, and broken references
   - produce actionable validation messages with file paths

6. **Finalize response**
   - include diff summary, validation table, and next-step suggestions
   - call out assumptions and unresolved input gaps explicitly

## Manifest Schema: `plugins/<plugin-id>/plugin.json`

Use this concrete schema contract when creating or validating plugin manifests.

### Required fields

- `id` (string): stable plugin identifier; should match folder slug.
- `name` (string): human-readable display name.
- `version` (string): SemVer-like format `x.y.z` (digits only per segment, for example `1.4.0`).
- `description` (string): short description of plugin purpose.
- `uiExtensions` (array): non-empty array of extension objects.

### Optional fields

- `author` (string)
- `homepage` (string URL)
- `settings` (object): plugin-level configuration schema or default settings.
- `enabled` (boolean): explicit default enablement state.

### Type expectations

- Manifest root must be a JSON object.
- `uiExtensions` must be an array of objects.
- Each `uiExtensions[]` object must include:
  - `type` (string)
  - `id` (string, unique within the plugin)
  - `title` (string)
  - route/config field:
    - either `route` (string path, e.g. `"/plugins/example/panel"`),
    - or equivalent configuration object under `config` (object), depending on extension type.
- `settings`, when present, must be a JSON object (not array/string/number).
- Empty arrays are not allowed for `uiExtensions`.

### Version rule

- Accept only SemVer-like values matching `^\d+\.\d+\.\d+$`.
- Reject versions such as `1.0`, `v1.2.3`, `1.2.3-beta` unless explicitly allowed by a future schema revision.

### Validation behavior

Validation should report:
- missing required fields;
- type mismatches (field value does not match expected type);
- duplicate `uiExtensions[].id` values within a manifest;
- empty arrays where not allowed (notably `uiExtensions: []`);
- malformed `version` not matching `x.y.z`.

Error messages should be actionable and include the JSON path (for example `uiExtensions[1].id`).

### Canonical valid example

```json
{
  "id": "analytics-dashboard",
  "name": "Analytics Dashboard",
  "version": "1.2.0",
  "description": "Adds dashboard widgets and reporting views.",
  "author": "MatMetrics Team",
  "homepage": "https://example.com/plugins/analytics-dashboard",
  "enabled": true,
  "settings": {
    "defaultRangeDays": 30,
    "showTrendline": true
  },
  "uiExtensions": [
    {
      "type": "page",
      "id": "analytics-overview-page",
      "title": "Analytics Overview",
      "route": "/plugins/analytics/overview"
    },
    {
      "type": "panel",
      "id": "analytics-summary-panel",
      "title": "Analytics Summary",
      "config": {
        "placement": "right-rail"
      }
    }
  ]
}
```

### Invalid example + expected errors

```json
{
  "id": "analytics-dashboard",
  "name": "Analytics Dashboard",
  "version": "v1.2",
  "description": 404,
  "enabled": "yes",
  "uiExtensions": [
    {
      "type": "page",
      "id": "dup-extension",
      "title": "Overview"
    },
    {
      "type": "panel",
      "id": "dup-extension",
      "title": 99,
      "route": "/plugins/analytics/panel"
    }
  ]
}
```

Expected validation errors (example):
- `version`: expected SemVer-like `x.y.z`, got `"v1.2"`.
- `description`: expected string, got number.
- `enabled`: expected boolean, got string.
- `uiExtensions[0]`: missing required `route` or `config` field.
- `uiExtensions[1].title`: expected string, got number.
- `uiExtensions[1].id`: duplicate extension id `dup-extension`.

## Safety Constraints

- Never overwrite existing plugin files without explicit user confirmation.
- Preserve unknown JSON keys when reading/writing plugin manifests.
- Avoid destructive deletes or directory removals unless explicitly requested.
- Prefer minimal, reversible edits and report exactly what changed.
- If validation tooling is unavailable, return a clear warning and a manual check plan.

## Output Contract

Return all of the following in the final response:
1. **File tree diff summary**
   - created/modified/deleted files (with concise per-file notes)
2. **Validation table**
   - columns: file/plugin, check, status (pass/warn/fail), details
3. **Next-step suggestions**
   - short, prioritized follow-ups (for example: run full validation, add tests, confirm assumptions)

Formatting requirements:
- keep sections in the order above;
- use explicit status labels (`pass`, `warn`, `fail`);
- include assumption notes whenever defaults were inferred.
