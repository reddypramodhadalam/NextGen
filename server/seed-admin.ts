import { db } from "./db";
import { users } from "@shared/models/auth";
import { hashPassword } from "./auth/password";
import { eq } from "drizzle-orm";

async function seedMasterAdmin() {
  const email = "admin@aitas.com";
  const password = "AitasMaster2024!";
  
  const existing = await db.select().from(users).where(eq(users.email, email));
  
  if (existing.length > 0) {
    console.log("Master admin already exists");
    process.exit(0);
  }
  
  const passwordHash = await hashPassword(password);
  
  await db.insert(users).values({
    email,
    passwordHash,
    firstName: "Master",
    lastName: "Admin",
    isActive: true,
    mustChangePassword: false,
    isSuperAdmin: true,
  });
  
  console.log("Master admin created successfully!");
  console.log("Email:", email);
  console.log("Password:", password);
  process.exit(0);
}

seedMasterAdmin().catch((err) => {
  console.error("Error creating master admin:", err);
  process.exit(1);
});
