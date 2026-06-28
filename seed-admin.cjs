/**
 * AITAS — Seed / Reset Admin User
 * ─────────────────────────────────────────────────────────────────────────
 * Idempotent. Run with:   node seed-admin.cjs
 *
 * Creates (or resets) the platform super-admin so you can log in with the
 * documented credentials:
 *
 *     Email:    admin@aitas.com
 *     Password: AitasMaster2024!
 *
 * Use SEED_EMAIL / SEED_PASSWORD env vars to override.
 */

const Database = require('better-sqlite3');
const crypto   = require('crypto');
const path     = require('path');

const DB_PATH  = process.env.SQLITE_DB_PATH || path.join(__dirname, 'aitas.db');
const EMAIL    = (process.env.SEED_EMAIL    || 'admin@aitas.com').toLowerCase();
const PASSWORD = process.env.SEED_PASSWORD  || 'AitasMaster2024!';
const FIRST    = process.env.SEED_FIRST     || 'Master';
const LAST     = process.env.SEED_LAST      || 'Admin';

const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST     = 'sha512';

function hash(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST, (err, key) => {
      if (err) return reject(err);
      resolve(`${salt}:${key.toString('hex')}`);
    });
  });
}

function verify(password, stored) {
  return new Promise((resolve, reject) => {
    const [salt, key] = stored.split(':');
    if (!salt || !key) return resolve(false);
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST, (err, derived) => {
      if (err) return reject(err);
      resolve(derived.toString('hex') === key);
    });
  });
}

(async () => {
  console.log('────────────────────────────────────────────────────────────');
  console.log('AITAS Admin Seed');
  console.log('────────────────────────────────────────────────────────────');
  console.log('DB:       ', DB_PATH);
  console.log('Email:    ', EMAIL);
  console.log('Password: ', PASSWORD);
  console.log('────────────────────────────────────────────────────────────');

  const db = new Database(DB_PATH);

  // 1) Ensure tables exist (matches server/auth/index.ts initializeAuthTables)
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      profile_image_url TEXT,
      is_active INTEGER DEFAULT 1,
      must_change_password INTEGER DEFAULT 1,
      is_super_admin INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expire ON auth_sessions(expire);
  `);

  // 2) Compute new hash
  const passwordHash = await hash(PASSWORD);
  const now          = Math.floor(Date.now() / 1000);

  // 3) Upsert
  const existing = db.prepare('SELECT id, password_hash FROM auth_users WHERE email = ?').get(EMAIL);

  if (existing) {
    db.prepare(`
      UPDATE auth_users
      SET    password_hash       = ?,
             first_name          = ?,
             last_name           = ?,
             is_active           = 1,
             must_change_password = 0,
             is_super_admin      = 1,
             updated_at          = ?
      WHERE  id = ?
    `).run(passwordHash, FIRST, LAST, now, existing.id);
    console.log('✅ Updated existing user (id:', existing.id, ')');
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO auth_users
        (id, email, password_hash, first_name, last_name,
         is_active, must_change_password, is_super_admin, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, 1, ?)
    `).run(id, EMAIL, passwordHash, FIRST, LAST, now);
    console.log('✅ Created new user (id:', id, ')');
  }

  // 4) Wipe any stale session rows so old cookies don't keep you logged out
  const wiped = db.prepare('DELETE FROM auth_sessions').run();
  if (wiped.changes > 0) {
    console.log(`🧹 Cleared ${wiped.changes} stale session(s)`);
  }

  // 5) Verify by reading back and re-hashing
  const row = db.prepare('SELECT password_hash, is_active, is_super_admin, must_change_password FROM auth_users WHERE email = ?').get(EMAIL);
  const ok  = await verify(PASSWORD, row.password_hash);

  console.log('────────────────────────────────────────────────────────────');
  console.log('Verification:');
  console.log('  Password matches:    ', ok ? '✅ YES' : '❌ NO (something is very wrong)');
  console.log('  is_active:           ', row.is_active           === 1 ? '✅' : '❌', row.is_active);
  console.log('  is_super_admin:      ', row.is_super_admin      === 1 ? '✅' : '⚠', row.is_super_admin);
  console.log('  must_change_password:', row.must_change_password === 0 ? '✅' : '⚠', row.must_change_password);
  console.log('────────────────────────────────────────────────────────────');

  db.close();

  if (!ok) {
    console.error('❌ POST-CHECK FAILED. Hash does not verify. Aborting.');
    process.exit(1);
  }

  console.log('');
  console.log('🎉 Done. You can now log in with:');
  console.log('     Email:    ', EMAIL);
  console.log('     Password: ', PASSWORD);
  console.log('');
  console.log('💡 If you have an open browser session, hard-refresh (Ctrl+Shift+R)');
  console.log('   or clear cookies for the AITAS origin first.');
})().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
