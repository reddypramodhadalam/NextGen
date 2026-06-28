// Quick diagnostic - shows what's in auth_users
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'aitas.db');
console.log('Opening:', dbPath);

const db = new Database(dbPath, { readonly: true });

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%user%' OR name LIKE '%auth%')").all();
  console.log('\nAuth/User tables found:');
  console.table(tables);

  const hasAuthUsers = tables.some(t => t.name === 'auth_users');
  if (!hasAuthUsers) {
    console.log('\n❌ auth_users table does NOT exist. Run the server once to create it, or run the seed script.');
  } else {
    const users = db.prepare('SELECT id, email, first_name, last_name, is_active, must_change_password, is_super_admin, length(password_hash) as hash_len FROM auth_users').all();
    console.log(`\n✅ auth_users has ${users.length} rows:`);
    console.table(users);

    if (users.length === 0) {
      console.log('\n⚠️  No users. You need to run the seed script.');
    } else {
      const admin = users.find(u => u.email === 'admin@aitas.com');
      if (!admin) {
        console.log('\n⚠️  No row for admin@aitas.com - seed it.');
      } else {
        console.log('\nDiagnostics for admin@aitas.com:');
        console.log('  is_active           =', admin.is_active, admin.is_active === 1 ? '✅' : '❌ (set to 1)');
        console.log('  is_super_admin      =', admin.is_super_admin, admin.is_super_admin === 1 ? '✅' : '⚠');
        console.log('  must_change_password=', admin.must_change_password, admin.must_change_password === 0 ? '✅' : '⚠ (will be forced to change pw)');
        console.log('  password_hash length=', admin.hash_len, '(should be ~161 for salt:64char hex hash)');
      }
    }
  }
} catch (e) {
  console.error('ERROR:', e.message);
}

db.close();
