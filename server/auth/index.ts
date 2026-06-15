import session from "express-session";
import type { Express, RequestHandler, Request, Response, NextFunction } from "express";
import { sqliteConnection } from "../db-sqlite";
import { hashPassword, verifyPassword } from "./password";
import { randomUUID } from "crypto";

// User type for auth
interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  isSuperAdmin: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    mustChangePassword: boolean;
  }
}

// Initialize auth users table for SQLite
function initializeAuthTables() {
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
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expire ON auth_sessions(expire);
  `);
}

initializeAuthTables();

// Simple SQLite session store
class SQLiteSessionStore extends session.Store {
  constructor() {
    super();
  }

  get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): void {
    try {
      const row = sqliteConnection.prepare("SELECT sess FROM auth_sessions WHERE sid = ? AND expire > ?").get(sid, Math.floor(Date.now() / 1000)) as any;
      if (row) {
        callback(null, JSON.parse(row.sess));
      } else {
        callback(null, null);
      }
    } catch (err) {
      callback(err);
    }
  }

  set(sid: string, session: session.SessionData, callback?: (err?: any) => void): void {
    try {
      const maxAge = session.cookie?.maxAge || 86400000; // Default 1 day
      const expire = Math.floor((Date.now() + maxAge) / 1000);
      sqliteConnection.prepare(`
        INSERT OR REPLACE INTO auth_sessions (sid, sess, expire) VALUES (?, ?, ?)
      `).run(sid, JSON.stringify(session), expire);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    try {
      sqliteConnection.prepare("DELETE FROM auth_sessions WHERE sid = ?").run(sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid: string, session: session.SessionData, callback?: (err?: any) => void): void {
    try {
      const maxAge = session.cookie?.maxAge || 86400000;
      const expire = Math.floor((Date.now() + maxAge) / 1000);
      sqliteConnection.prepare("UPDATE auth_sessions SET expire = ? WHERE sid = ?").run(expire, sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  return session({
    secret: process.env.SESSION_SECRET || 'aitas-default-secret-change-in-production',
    store: new SQLiteSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

// Helper to get auth user by email
function getAuthUserByEmail(email: string): AuthUser | null {
  const row = sqliteConnection.prepare("SELECT * FROM auth_users WHERE email = ?").get(email.toLowerCase()) as any;
  if (!row) return null;
  return mapAuthUser(row);
}

// Helper to get auth user by ID
function getAuthUserById(id: string): AuthUser | null {
  const row = sqliteConnection.prepare("SELECT * FROM auth_users WHERE id = ?").get(id) as any;
  if (!row) return null;
  return mapAuthUser(row);
}

function mapAuthUser(row: any): AuthUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    firstName: row.first_name,
    lastName: row.last_name,
    profileImageUrl: row.profile_image_url,
    isActive: row.is_active === 1,
    mustChangePassword: row.must_change_password === 1,
    isSuperAdmin: row.is_super_admin === 1,
    createdAt: new Date(row.created_at * 1000),
    updatedAt: row.updated_at ? new Date(row.updated_at * 1000) : null,
  };
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Login endpoint
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = getAuthUserByEmail(email);

      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.isActive) {
        return res.status(401).json({ message: "Account is disabled. Please contact an administrator." });
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      req.session.userId = user.id;
      req.session.mustChangePassword = user.mustChangePassword || false;

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isSuperAdmin: user.isSuperAdmin,
          mustChangePassword: user.mustChangePassword,
        },
        mustChangePassword: user.mustChangePassword,
      });
    } catch (error: any) {
      console.error("Login error:", error?.message || error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user endpoint
  app.get("/api/auth/user", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = getAuthUserById(req.session.userId);

      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        isSuperAdmin: user.isSuperAdmin,
        mustChangePassword: user.mustChangePassword,
        isActive: user.isActive,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Change password endpoint
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ message: "All fields are required" });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const user = getAuthUserById(req.session.userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const newPasswordHash = await hashPassword(newPassword);

      sqliteConnection.prepare(`
        UPDATE auth_users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?
      `).run(newPasswordHash, Math.floor(Date.now() / 1000), req.session.userId);

      req.session.mustChangePassword = false;

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });
}

// Authentication middleware
export const isAuthenticated: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = getAuthUserById(req.session.userId);

  if (!user || !user.isActive) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Attach user to request for use in routes
  (req as any).user = user;
  next();
};

// Middleware to check if user must change password
export const requirePasswordChange: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.mustChangePassword) {
    return res.status(403).json({
      message: "Password change required",
      mustChangePassword: true,
    });
  }
  next();
};

// Create user helper function (for admin use)
export async function createUser(
  email: string,
  firstName: string,
  lastName: string,
  temporaryPassword: string,
  isSuperAdmin: boolean = false
): Promise<AuthUser> {
  const passwordHash = await hashPassword(temporaryPassword);
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  
  sqliteConnection.prepare(`
    INSERT INTO auth_users (id, email, password_hash, first_name, last_name, is_active, must_change_password, is_super_admin, created_at)
    VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(id, email.toLowerCase(), passwordHash, firstName, lastName, isSuperAdmin ? 1 : 0, now);

  return getAuthUserById(id) as AuthUser;
}

// Get user by email
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  return getAuthUserByEmail(email);
}
