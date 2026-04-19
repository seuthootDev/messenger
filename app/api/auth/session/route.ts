import { NextResponse } from "next/server";
import { getAuthCookieFromHeader, getAuthSessionFromCookie } from "@/lib/auth";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieValue = getAuthCookieFromHeader(cookieHeader);
  const session = getAuthSessionFromCookie(cookieValue);

  return NextResponse.json(session);
}
