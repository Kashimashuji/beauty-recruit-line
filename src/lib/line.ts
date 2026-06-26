import crypto from "crypto";

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const SECRET = process.env.LINE_CHANNEL_SECRET!;

// Webhook署名検証：LINE以外からの偽リクエストを弾く
export function verifyLineSignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const hash = crypto.createHmac("sha256", SECRET).update(body).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

// 単一ユーザーへのプッシュ送信
export async function pushText(to: string, text: string): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE push failed: ${res.status} ${await res.text()}`);
  }
}

// セグメント配信（複数ユーザー一括 / multicastは最大500件）
export async function multicastText(userIds: string[], text: string): Promise<void> {
  for (let i = 0; i < userIds.length; i += 500) {
    const batch = userIds.slice(i, i + 500);
    const res = await fetch("https://api.line.me/v2/bot/message/multicast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ to: batch, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) {
      throw new Error(`LINE multicast failed: ${res.status} ${await res.text()}`);
    }
  }
}

// プロフィール取得（友だち追加時に表示名を保存するため）
export async function getProfile(userId: string): Promise<{ displayName: string }> {
  const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) return { displayName: "" };
  return res.json();
}
