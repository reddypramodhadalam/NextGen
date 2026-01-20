import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for express-session
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table with email/password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isActive: boolean("is_active").default(true),
  mustChangePassword: boolean("must_change_password").default(false),
  isSuperAdmin: boolean("is_super_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schema for user creation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

// Register schema (for admin creating users)
export const createUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  temporaryPassword: z.string().min(8, "Password must be at least 8 characters"),
  isSuperAdmin: z.boolean().optional().default(false),
});

// Change password schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Confirm password is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// Add project member schema
export const addProjectMemberSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  temporaryPassword: z.string().min(8, "Password must be at least 8 characters"),
  role: z.string().min(1, "Role is required"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
