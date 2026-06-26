import { createClient } from "@supabase/supabase-js";

// サーバー側専用。service role キーを使うので絶対にクライアントへ露出しない。
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
