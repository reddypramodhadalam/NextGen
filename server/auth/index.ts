import session from "express-session";
import type { Express, RequestHandler, Request, Response, NextFunction } from "express";
import connectPg from "connect-pg-simple";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./password";
import type { User } from "@shared/models/auth";

declare module "express-session" {
  interface SessionData {
    userId: string;
    mustChangePassword: boolean;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
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

      // Query for user
      const results = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      const user = results[0];

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

      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));

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

      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const newPasswordHash = await hashPassword(newPassword);

      await db.update(users)
        .set({
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.session.userId));

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

  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));

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
): Promise<User> {
  const passwordHash = await hashPassword(temporaryPassword);
  
  const [newUser] = await db.insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      isActive: true,
      mustChangePassword: true,
      isSuperAdmin,
    })
    .returning();

  return newUser;
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return user || null;
}
