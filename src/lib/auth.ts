import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase";

const SUPER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? "super-change-me";
const COOKIE_NAME = "admin_session";

export type Session =
  | { role: "super" }
  | { role: "company"; company_id: string; company_name: string; slug: string };

export async function getSession(): Promise<Session | null> {
  const cookie = cookies().get(COOKIE_NAME)?.value;
  if (!cookie) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cookie, "base64").toString("utf-8"));
    if (parsed.role === "super") return { role: "super" };
    if (parsed.role === "company" && parsed.company_id) return parsed as Session;
  } catch {}
  return null;
}

export function setSessionCookie(session: Session): string {
  return Buffer.from(JSON.stringify(session)).toString("base64");
}

export async function loginCompany(slug: string, password: string): Promise<Session | null> {
  if (slug === "super" && password === SUPER_PASSWORD) {
    return { role: "super" };
  }
  const { data } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug, password")
    .eq("slug", slug)
    .single();
  if (!data || data.password !== password) return null;
  return { role: "company", company_id: data.id, company_name: data.name, slug: data.slug };
}
