import "dotenv/config";
import { storage } from "./server/storage";
import { createUser } from "./server/auth";

async function seedAdmin() {
  try {
    console.log("🌱 Seeding admin user...");

    // Try to create admin user
    const adminEmail = "admin@aitas.com";
    const adminPassword = "AitasMaster2024!";
    const adminName = "Admin User";

    // Check if admin already exists
    const existingAdmin = await (storage.getAllUsers?.() || Promise.resolve([]));
    const adminExists = Array.isArray(existingAdmin) && 
      existingAdmin.some((u: any) => u.email === adminEmail);

    if (adminExists) {
      console.log("✅ Admin user already exists!");
      process.exit(0);
    }

    // Create admin user
    const admin = await createUser(
      adminEmail,
      adminName,
      adminName,
      adminPassword,
      true // isAdmin
    );

    console.log("✅ Admin user created successfully!");
    console.log("📧 Email: admin@aitas.com");
    console.log("🔐 Password: AitasMaster2024!");
    console.log("✨ You can now log in!");

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error seeding admin:", error.message);
    process.exit(1);
  }
}

seedAdmin();
