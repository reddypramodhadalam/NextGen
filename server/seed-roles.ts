import "dotenv/config";
import { sqliteConnection } from "./db-sqlite";
import { randomUUID } from "crypto";

const defaultRoles = [
  {
    name: "admin",
    displayName: "Administrator",
    description: "Full access to all project features",
    permissions: ["view", "create", "edit", "delete", "execute", "admin"],
    isSystem: true,
  },
  {
    name: "tester",
    displayName: "Tester",
    description: "Can view, create, and execute tests",
    permissions: ["view", "create", "execute"],
    isSystem: true,
  },
  {
    name: "viewer",
    displayName: "Viewer",
    description: "Read-only access to project resources",
    permissions: ["view"],
    isSystem: true,
  },
];

async function seedRoles() {
  console.log("Seeding default roles...");

  for (const role of defaultRoles) {
    try {
      // Check if role already exists
      const existing = sqliteConnection
        .prepare("SELECT id FROM roles WHERE name = ?")
        .get(role.name) as any;
      if (existing) {
        console.log(`✓ Role '${role.name}' already exists`);
        continue;
      }

      const id = randomUUID();
      const now = Math.floor(Date.now() / 1000);
      sqliteConnection
        .prepare(`
        INSERT INTO roles (id, name, description, permissions, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
        .run(id, role.name, role.description, JSON.stringify(role.permissions), now);
      console.log(`✓ Role '${role.name}' created`);
    } catch (error) {
      console.error(`✗ Failed to create role '${role.name}':`, error);
    }
  }

  console.log("\nRole seeding complete!");
  process.exit(0);
}

seedRoles().catch((err) => {
  console.error("Error seeding roles:", err);
  process.exit(1);
});
