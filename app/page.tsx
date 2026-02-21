export default function Home() {
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 600, margin: "40px auto", padding: "0 20px" }}>
      <h1>📅 Notion → Google Calendar Sync</h1>
      <p>NotionのTODOデータベースからGoogleカレンダーへ自動同期するシステムです。</p>

      <h2>API エンドポイント</h2>
      <ul>
        <li>
          <code>GET /api/sync</code> — 過去15分間の更新を同期
        </li>
        <li>
          <code>GET /api/sync?full=true</code> — 全件同期
        </li>
      </ul>

      <h2>ステータス</h2>
      <p>
        Vercel Cronにより毎日自動同期が実行されます。
        <br />
        より頻繁な同期には外部cronサービスを設定してください。
      </p>
    </div>
  );
}
