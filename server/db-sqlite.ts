/**
 * SQLite Database Configuration
 * Database stored in OneDrive for persistent storage
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Database path — local project folder (fallback if env not set)
const DB_PATH = process.env.SQLITE_DB_PATH ||
  path.join(process.cwd(), "aitas.db");

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`[SQLite] Connecting to database at: ${DB_PATH}`);

// Create SQLite connection
export const sqliteConnection = new Database(DB_PATH);
sqliteConnection.pragma("journal_mode = WAL"); // Better concurrent access

// Export database path for reference
export const DATABASE_PATH = DB_PATH;

console.log("[SQLite] Database connected successfully");
