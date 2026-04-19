import { createHash } from "crypto";

export const AUTH_COOKIE_NAME = "chat_auth";
export type ChatUser = "A" | "B";

type AuthSession = {
  authenticated: boolean;
  user?: ChatUser;
};

function getExpectedPassword(user: ChatUser): string {
  const password = user === "A" ? process.env.CHAT_PASSWORD_A : process.env.CHAT_PASSWORD_B;
  if (!password) {
    throw new Error(`CHAT_PASSWORD_${user} is not configured`);
  }
  return password;
}

function buildAuthToken(user: ChatUser, password: string): string {
  return createHash("sha256").update(`chat-auth:${user}:${password}`).digest("hex");
}

export function verifyLoginPassword(user: ChatUser, inputPassword: string): boolean {
  const expected = getExpectedPassword(user);
  return inputPassword === expected;
}

export function getAuthCookieValue(user: ChatUser): string {
  const token = buildAuthToken(user, getExpectedPassword(user));
  return `${user}:${token}`;
}

export function getAuthSessionFromCookie(cookieValue?: string): AuthSession {
  if (!cookieValue) {
    return { authenticated: false };
  }

  const [userPart, tokenPart] = cookieValue.split(":");
  if (!userPart || !tokenPart || (userPart !== "A" && userPart !== "B")) {
    return { authenticated: false };
  }

  const user = userPart as ChatUser;
  const expected = buildAuthToken(user, getExpectedPassword(user));
  if (tokenPart !== expected) {
    return { authenticated: false };
  }

  return { authenticated: true, user };
}

export function getAuthCookieFromHeader(cookieHeader: string): string | undefined {
  const rawCookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${AUTH_COOKIE_NAME}=`));

  if (!rawCookie) {
    return undefined;
  }

  const encodedValue = rawCookie.split("=").slice(1).join("=");

  try {
    return decodeURIComponent(encodedValue);
  } catch {
    return encodedValue;
  }
}
