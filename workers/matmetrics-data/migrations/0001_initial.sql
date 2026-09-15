CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  preferences_json TEXT NOT NULL CHECK (json_valid(preferences_json)),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE plugin_enabled_overrides (
  user_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, plugin_id)
) STRICT;
