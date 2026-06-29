import { NextRequest, NextResponse } from "next/server";
import { loginCompany, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { slug, password } = await req.json();
  if (!slug || !password) {
    return NextResponse.json({ error: "入力してください" }, { status: 400 });
  }
  const session = await loginCompany(slug, password);
  if (!session) {
    return NextResponse.json({ error: "IDまたはパスワードが違います" }, { status: 401 });
  }
  const res = NextResponse.json({
    ok: true,
    role: session.role,
    company_name: session.role === "company" ? session.company_name : null,
  });
  res.cookies.set("admin_session", setSessionCookie(session), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_session", "", { maxAge: 0, path: "/" });
  return res;
}
