import "dotenv/config";
import { sqliteConnection } from "./db-sqlite";
import { hashPassword } from "./auth/password";
import { randomUUID } from "crypto";

async function seedMasterAdmin() {
  const email = "admin@aitas.com";
  const password = "AitasMaster2024!";
  
  // Initialize auth_users table if not exists
  sqliteConnection.exec(`
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
    )
  `);
  
  const existing = sqliteConnection.prepare("SELECT * FROM auth_users WHERE email = ?").get(email) as any;
  
  if (existing) {
    console.log("Master admin already exists");
    process.exit(0);
  }
  
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  
  sqliteConnection.prepare(`
    INSERT INTO auth_users (id, email, password_hash, first_name, last_name, is_active, must_change_password, is_super_admin, created_at)
    VALUES (?, ?, ?, ?, ?, 1, 0, 1, ?)
  `).run(id, email, passwordHash, "Master", "Admin", now);
  
  console.log("Master admin created successfully!");
  console.log("Email:", email);
  console.log("Password:", password);
  console.log("Database:", "C:\\Users\\adalamr\\OneDrive - Baxter\\Database\\aitas.db");
  process.exit(0);
}

seedMasterAdmin().catch((err) => {
  console.error("Error creating master admin:", err);
  process.exit(1);
});
