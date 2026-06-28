// Verify the stored password hash actually matches "AitasMaster2024!"
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

function verify(password, hash) {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    if (!salt || !key) return resolve(false);
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex') === key);
    });
  });
}

(async () => {
  const db = new Database(path.join(__dirname, 'aitas.db'), { readonly: true });
  const row = db.prepare('SELECT email, password_hash FROM auth_users WHERE email = ?').get('admin@aitas.com');
  db.close();

  if (!row) {
    console.log('❌ No admin user');
    return;
  }

  const candidates = [
    'AitasMaster2024!',
    'Admin@123',
    'admin',
    'password',
    'AITAS@2024',
    'changeme',
    'Aitas2024',
    'AitasAdmin2024!',
  ];

  console.log('Testing common passwords against the stored hash...\n');
  for (const pw of candidates) {
    const ok = await verify(pw, row.password_hash);
    console.log(`  ${ok ? '✅ MATCH' : '❌      '}  ${pw}`);
    if (ok) {
      console.log(`\n🔑 The current password is: ${pw}`);
      return;
    }
  }
  console.log('\n⚠️  None of the common passwords match. The hash was created with an unknown password.');
  console.log('    Run reset-admin-password.cjs to set it to AitasMaster2024!.');
})();
