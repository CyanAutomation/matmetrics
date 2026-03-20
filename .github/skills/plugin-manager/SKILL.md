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
