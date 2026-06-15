// Quick test to verify SQLite storage is working
import "dotenv/config";
import { sqliteConnection, DATABASE_PATH } from "./db-sqlite";

// Import sqlite-storage to trigger table initialization
import "./sqlite-storage";

console.log("\nDatabase path:", DATABASE_PATH);

// Test SQLite connection
try {
  const result = sqliteConnection.prepare("SELECT sqlite_version() as version").get() as any;
  console.log("SQLite version:", result.version);
  
  // Check tables
  const tables = sqliteConnection.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
  `).all() as any[];
  console.log("Tables:", tables.map(t => t.name).join(", "));
  
  // Check auth_users
  const authUsers = sqliteConnection.prepare("SELECT COUNT(*) as count FROM auth_users").get() as any;
  console.log("Auth users count:", authUsers.count);
  
  // Check test_suites
  const suites = sqliteConnection.prepare("SELECT COUNT(*) as count FROM test_suites").get() as any;
  console.log("Test suites count:", suites.count);
  
  console.log("\n✅ SQLite database is working correctly!");
} catch (err: any) {
  console.error("❌ Error:", err.message);
}
