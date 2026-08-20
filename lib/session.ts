import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export type SessionData = {
  userId?: string;
  address?: string;
  walletType?: string;
  admin?: boolean;
};

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters. See .env.example.");
  }
  return {
    cookieName: "globalx_session",
    password,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

export async function requireUser() {
  const session = await getSession();
  if (!session.userId || !session.address) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session.admin) throw new Error("ADMIN_REQUIRED");
  return session;
}
