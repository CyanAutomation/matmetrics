import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(scriptDirectory, '../migrations');
const migrationFiles = [
  '0001_initial.sql',
  '0002_background_jobs.sql',
  '0003_better_auth_identity.sql',
  '0004_auth_registration_guards.sql',
  '0005_better_auth_identity_trigger.sql',
];

async function createDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const fileName of migrationFiles) {
    db.exec(await readFile(path.join(migrationDirectory, fileName), 'utf8'));
  }
  return db;
}

function addBetterAuthUser(db, id) {
  const now = Date.now();
  db.prepare(
    'INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, ?, ?, 1, NULL, ?, ?)'
  ).run(id, `User ${id}`, `${id}@example.test`, now, now);
}

function addFirebaseIdentity(db, id, appUserId) {
  db.prepare(
    'INSERT INTO auth_identities (id, app_user_id, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, appUserId, 'firebase', appUserId, Date.now());
}

async function applyRetirementMigration(db) {
  const migration = await readFile(
    path.join(migrationDirectory, '0006_retire_firebase_auth.sql'),
    'utf8'
  );
  db.exec(migration);
}

async function createMigratableDatabase() {
  const db = await createDatabase();
  addBetterAuthUser(db, 'canonical-user');
  addFirebaseIdentity(db, 'firebase-identity', 'canonical-user');
  const now = Date.now();
  db.prepare(
    'INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('password-account', 'canonical-user', 'credential', 'canonical-user', 'hash', now, now);
  db.prepare(
    'INSERT INTO passkey (id, name, publicKey, userId, credentialID, counter, deviceType, backedUp, transports, createdAt, aaguid) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, NULL)'
  ).run('passkey-id', 'Primary', 'public-key', 'canonical-user', 'credential-id', 'singleDevice', 'internal', now);
  db.prepare(
    'INSERT INTO user_preferences (user_id, preferences_json, revision, updated_at) VALUES (?, ?, ?, ?)'
  ).run('canonical-user', '{"theme":"dark"}', 4, now);
  db.prepare(
    'INSERT INTO plugin_enabled_overrides (user_id, plugin_id, enabled, updated_at) VALUES (?, ?, ?, ?)'
  ).run('canonical-user', 'example-plugin', 1, now);

  const expiresAt = now + 60_000;
  const completedAt = now + 1;
  db.prepare(
    'INSERT INTO auth_registration_context_claims (nonce, app_user_id, provider, provider_subject, expires_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)'
  ).run('legacy-nonce', 'canonical-user', 'firebase', 'canonical-user', expiresAt, now);
  db.prepare(
    'INSERT INTO auth_registration_context_completions (nonce, app_user_id, completed_at) VALUES (?, ?, ?)'
  ).run('legacy-nonce', 'canonical-user', completedAt);
  db.prepare(
    'UPDATE auth_registration_context_claims SET completed_at = ? WHERE nonce = ?'
  ).run(completedAt, 'legacy-nonce');
  return db;
}

test('Firebase auth retirement keeps Better Auth identities and user data, and drops legacy auth structures', async () => {
  const db = await createMigratableDatabase();
  try {
    await applyRetirementMigration(db);

    assert.equal(
      db.prepare('SELECT count(*) AS count FROM user').get().count,
      1
    );
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM account').get().count,
      1
    );
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM passkey').get().count,
      1
    );
    assert.deepEqual(
      {
        ...db
          .prepare('SELECT preferences_json, revision FROM user_preferences')
          .get(),
      },
      { preferences_json: '{"theme":"dark"}', revision: 4 }
    );
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM plugin_enabled_overrides').get().count,
      1
    );
    assert.deepEqual(
      {
        ...db
          .prepare('SELECT provider, provider_subject FROM auth_identities')
          .get(),
      },
      { provider: 'better-auth', provider_subject: 'canonical-user' }
    );

    const legacyTables = db
      .prepare(
        "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('auth_registration_contexts', 'auth_registration_context_claims', 'auth_registration_context_completions')"
      )
      .get();
    assert.equal(legacyTables.count, 0);
    assert.equal(
      db
        .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name = 'validate_auth_registration_context_completion'")
        .get().count,
      0
    );
    assert.equal(
      db
        .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name = 'prevent_final_passkey_deletion'")
        .get().count,
      1
    );
    assert.equal(
      db
        .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name = 'reject_better_auth_identity_conflict_before_user_insert'")
        .get().count,
      1
    );

    assert.match(
      db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'reject_better_auth_identity_conflict_before_user_insert'")
        .get().sql,
      /BETTER_AUTH_IDENTITY_CONFLICT/
    );
    assert.throws(
      () => addFirebaseIdentity(db, 'rejected-firebase-identity', 'canonical-user'),
      /CHECK constraint failed/
    );

    addBetterAuthUser(db, 'second-user');
    assert.equal(
      db
        .prepare("SELECT count(*) AS count FROM auth_identities WHERE app_user_id = 'second-user' AND provider = 'better-auth'")
        .get().count,
      1
    );
  } finally {
    db.close();
  }
});

test('Firebase auth retirement stops before changing identities if a Firebase-only account remains', async () => {
  const db = await createMigratableDatabase();
  try {
    const now = Date.now();
    db.prepare('INSERT INTO app_users (id, created_at, updated_at) VALUES (?, ?, ?)').run(
      'firebase-only-user',
      now,
      now
    );
    addFirebaseIdentity(db, 'firebase-only-identity', 'firebase-only-user');

    await assert.rejects(applyRetirementMigration(db), /CHECK constraint failed/);
    assert.equal(
      db
        .prepare("SELECT count(*) AS count FROM auth_identities WHERE provider = 'firebase'")
        .get().count,
      2
    );
    assert.equal(
      db
        .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'auth_registration_context_claims'")
        .get().count,
      1
    );
  } finally {
    db.close();
  }
});

test('Firebase auth retirement refuses to drop an in-flight legacy registration context', async () => {
  const db = await createMigratableDatabase();
  try {
    const now = Date.now();
    db.prepare(
      'INSERT INTO auth_registration_contexts (nonce, app_user_id, expires_at, completed_at, created_at) VALUES (?, ?, ?, NULL, ?)'
    ).run('in-flight-context', 'canonical-user', now + 60_000, now);

    await assert.rejects(applyRetirementMigration(db), /CHECK constraint failed/);
    assert.equal(
      db
        .prepare('SELECT count(*) AS count FROM auth_registration_contexts')
        .get().count,
      1
    );
    assert.equal(
      db
        .prepare("SELECT count(*) AS count FROM auth_identities WHERE provider = 'firebase'")
        .get().count,
      1
    );
  } finally {
    db.close();
  }
});
