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

export async function PATCH(req: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "company") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { current_password, new_password } = await req.json();
  if (!current_password || !new_password || new_password.length < 6) {
    return NextResponse.json({ error: "パスワードは6文字以上で入力してください" }, { status: 400 });
  }
  const { supabaseAdmin } = await import("@/lib/supabase");
  const { data } = await supabaseAdmin
    .from("companies").select("password").eq("id", session.company_id).single();
  if (!data || data.password !== current_password) {
    return NextResponse.json({ error: "現在のパスワードが違います" }, { status: 401 });
  }
  const { error } = await supabaseAdmin
    .from("companies").update({ password: new_password }).eq("id", session.company_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
