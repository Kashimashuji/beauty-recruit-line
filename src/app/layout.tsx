export const metadata = { title: "美容採用LINEツール" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/* LIFF SDK */}
        <script src="https://static.line-scdn.net/liff/edge/2/sdk.js" async></script>
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
