import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, ChatUser, getAuthCookieValue, verifyLoginPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { user?: ChatUser; password?: string };
    const user = body.user;
    const password = body.password?.trim();

    if (!user || (user !== "A" && user !== "B")) {
      return NextResponse.json({ error: "Неверный пользователь" }, { status: 400 });
    }

    if (!password || !verifyLoginPassword(user, password)) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, user });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: getAuthCookieValue(user),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: "Ошибка входа", details: String(error) },
      { status: 500 },
    );
  }
}
