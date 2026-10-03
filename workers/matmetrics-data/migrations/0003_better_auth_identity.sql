-- Better Auth and provider-neutral MatMetrics identities. This migration is
-- additive; existing user_id values and application rows are left untouched.
CREATE TABLE app_users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  app_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('firebase', 'better-auth')),
  provider_subject TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (provider, provider_subject),
  UNIQUE (app_user_id, provider)
) STRICT;

CREATE INDEX auth_identities_user_idx ON auth_identities (app_user_id);

CREATE TABLE auth_registration_contexts (
  nonce TEXT PRIMARY KEY,
  app_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
) STRICT;

-- Better Auth core schema (email/password provider remains disabled).
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX session_userId_idx ON session (userId);

CREATE TABLE account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX account_userId_idx ON account (userId);

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX verification_identifier_idx ON verification (identifier);

-- @better-auth/passkey schema.
CREATE TABLE passkey (
  id TEXT PRIMARY KEY,
  name TEXT,
  publicKey TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL UNIQUE,
  counter INTEGER NOT NULL,
  deviceType TEXT NOT NULL,
  backedUp INTEGER NOT NULL,
  transports TEXT,
  createdAt INTEGER,
  aaguid TEXT
);

CREATE INDEX passkey_userId_idx ON passkey (userId);

-- better-auth JWT/JWKS plugin schema. alg/crv are nullable in upstream schema
-- so existing key rows remain readable when signing configuration evolves.
CREATE TABLE jwks (
  id TEXT PRIMARY KEY,
  publicKey TEXT NOT NULL,
  privateKey TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER,
  alg TEXT,
  crv TEXT
);
