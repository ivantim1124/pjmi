# PJMI 座位安排 Worker

座位安排使用獨立的 Cloudflare Worker，與比賽看板的 Pages 頁面及 API 分開部署。主站的快速連結仍指向 `https://seating.pjmi.dpdns.org/`。

這個 Worker 包含獨立的座位頁、登入、名單 CSV 匯入與名條 API。座位表存在目前瀏覽器；學生名單存放在獨立 D1 `pjmi-seating`，與比賽資料分開。初次搬移只複製座號與姓名；比賽資料及原 D1 表格都保留原樣。

## 部署

```bash
cd seating-worker
npm install
npx wrangler d1 execute pjmi-seating --remote --file=./schema.sql
npm run build
npx wrangler deploy --config wrangler-preview.toml
```

首次部署先使用 `pjmi-seating.<account>.workers.dev` 預覽，不會改動既有座位網址。至 Cloudflare Worker 的 Settings → Variables and Secrets 設定加密變數：

- `ADMIN_PASSWORD`：使用你目前管理座位名單的密碼。
- `ADMIN_SESSION_SECRET`：新的隨機工作階段密鑰，至少 32 bytes。

兩個值都不要放進 Git、`wrangler.toml` 或公開訊息。舊 Pages 的隱藏密碼無法由 Wrangler 讀出；需由管理者重新輸入。

## 將正式子網域切換到 Worker

Worker 預覽確認可載入且登入密碼已設定後，再切換 `seating.pjmi.dpdns.org`：

1. 在 `competition-board` Pages 專案移除 `seating.pjmi.dpdns.org` custom domain。
2. 移除該子網域原本指向 `competition-board.pages.dev` 的 DNS CNAME。
3. 執行 `npm run deploy`，Wrangler 會把 Custom Domain `seating.pjmi.dpdns.org` 綁到 Worker；Cloudflare 會管理該網域的 DNS 與 TLS 憑證。
4. 發布移除座位頁與 API 的 `competition-board` 更新。

Worker 頁面、登入狀態 API 與座號 JavaScript 都由 Worker 直接回傳並設定 `no-store`，避免瀏覽器或 Cloudflare 快取舊的按鈕狀態。
