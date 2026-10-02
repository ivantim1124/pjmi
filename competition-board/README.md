# PJMI 比賽看板

這是一個獨立的 Astro 子專案，公開頁面與管理介面部署到 Cloudflare Pages，資料存放在 Cloudflare D1。

Google 試算表的管理者連線檢查入口已預備；正式環境狀態請以管理頁為準。比賽內容仍保留在 D1，正式網域的瀏覽計數由網路防護 Worker 提供；Script 與設定請看 [`設定指南`](../integrations/google-sheets/設定指南.md)。

## 建議網址

- 公開看板：`https://competitions.pjmi.dpdns.org/`
- 管理介面：`https://competitions.pjmi.dpdns.org/admin/`

「比賽看板」是中文顯示名稱；DNS 子網域使用 `competitions`，比較容易輸入、分享，也避免 IDN/Punycode 在不同裝置上顯示不一致。

## Cloudflare 設定順序

1. 在 Cloudflare Workers & Pages 建立 Pages 專案，連結 GitHub `ivantim1124/pjmi`。
2. Root directory 必須設為 `competition-board`，Build command 設為 `npm install && npm run build`。
3. Build output directory 設為 `dist`。不能只在指令中 `cd` 而保持根目錄空白，否則 Pages 自動部署可能漏掉專案的 `functions/`，導致管理 API 回傳 404。
4. Pages 專案完成第一次部署後，在 Custom domains 加入 `competitions.pjmi.dpdns.org`。
5. 在 DNS 建立 `competitions` 的 CNAME，指向 Cloudflare Pages 提供的 `*.pages.dev` 網址。
6. 建立 D1：

   ```bash
   cd competition-board
   npx wrangler login
   npx wrangler d1 create pjmi-competitions
   ```

   把指令回傳的 `database_id` 填入 `wrangler.toml`，取代 `REPLACE_WITH_D1_DATABASE_ID`。

7. 初始化資料表：

   ```bash
   npx wrangler d1 execute pjmi-competitions --remote --file=./schema.sql
   ```

   每次 `schema.sql` 增加新的 `CREATE TABLE IF NOT EXISTS` 或索引後，都可以安全地重新執行同一條指令。登入限速功能需要 `admin_login_attempts` 資料表；若尚未手動執行，新版 Pages Function 也會在首次登入時以 `IF NOT EXISTS` 自動建立，不會修改既有比賽資料。

8. 在 Pages 專案的 Settings → Variables and Secrets → Production 加入兩個加密變數：
   - `ADMIN_PASSWORD`：你自行設定的管理密碼。
   - `ADMIN_SESSION_SECRET`：長且隨機的登入工作階段密鑰，可用 `openssl rand -hex 32` 產生。

   這兩個值不要提交到 GitHub，也不要貼在公開訊息中。儲存後重新部署 Pages 專案。

9. 使用免費方案唯一一條 WAF Rate Limiting Rule，在流量進入 Pages Function 前保護所有 API：
   - Cloudflare → `pjmi.dpdns.org` → Security → Security rules → Create rule → Rate limiting rules。
   - 規則名稱：`PJMI API flood protection`。
   - 條件：`URI Path starts with /api/`。
   - Rate：每個 IP 每 10 秒最多 20 次請求。
   - Action：`Block`；Duration：10 秒。

10. 在 Workers & Pages → 比賽看板專案 → Settings → Runtime，將免費額度用完時的行為設為 `Fail open`。API 暫時無法執行時，靜態首頁與說明頁仍會繼續提供服務。

11. 在同一個 zone 建立免費 Custom WAF Rule，保護三個 PJMI 網站：
    - 條件：`http.host in {"pjmi.dpdns.org" "competitions.pjmi.dpdns.org" "englishword.pjmi.dpdns.org"} and ip.src.country ne "TW"`
    - Action：`Block`
    - 規則名稱可用：`Block non-Taiwan PJMI websites`

    比賽站與單字站也會在 Pages middleware 再做一次限制；主站是純靜態站，使用這條 Cloudflare 邊緣規則保護。

管理頁會顯示密碼登入畫面；只有登入成功的工作階段可以讀取、新增、編輯或刪除資料。公開看板不需要登入，也不需要 Cloudflare Zero Trust。

## 免費安全防護

- 登入失敗 5 次後，該來源會暫停登入 30 分鐘；紀錄使用不可逆雜湊，不儲存原始 IP。
- 管理工作階段有效 8 小時，Cookie 使用 `HttpOnly`、`Secure`、`SameSite=Strict` 與 `__Host-` 限制。
- 新增、修改、刪除與登出 API 只接受同源請求，並限制 JSON 請求大小。
- Pages middleware 與 `_headers` 會加入 CSP、防 iframe 點擊劫持、MIME 嗅探防護、權限限制與管理頁禁止快取。
- 所有 SQL 都使用參數綁定，公開資料在寫入 HTML 前會跳脫。
- `_routes.json` 讓 middleware 檢查全站；API 只允許實際存在的路徑與 HTTP 方法，URL 限制 4096 字元、寫入請求宣告大小限制 64 KiB，實際 JSON 仍由共用解析器限制在 16 KiB。
- 公開比賽 API 會以固定快取鍵在 Cloudflare 邊緣快取 30 秒，避免用不同查詢字串繞過快取而反覆讀取 D1。
- API URL 會限制在 4096 字元內；管理寫入仍需要登入、同源請求與 16 KiB JSON 上限。
- Cloudflare 免費方案預設提供 L3–L7 DDoS 防護；程式層驗證與快取負責降低 API 濫用與 D1 壓力，無法取代 Cloudflare 邊緣層的大型 DDoS 防護。

Cloudflare Pages 的免費 WAF Rate Limiting 只有一條規則；若 `pjmi.dpdns.org` 是別人管理的父網域，這條 zone 規則無法由你建立，請以 Pages 內建 DDoS、快取與程式層驗證為主，詳見根目錄 [`SECURITY.md`](../SECURITY.md)。

以上只使用 Cloudflare Pages Functions 與既有 D1 免費額度，不需要 Zero Trust、付費 WAF 或信用卡。建議 `ADMIN_PASSWORD` 至少 16 個字元且不要與其他服務共用；`ADMIN_SESSION_SECRET` 請使用 `openssl rand -hex 32` 產生。

## 本機預覽

```bash
npm install
npm run dev
```

Astro 頁面可以直接預覽；正式環境的資料來自 Cloudflare D1，管理 API 需要 Pages Functions、D1 與兩個登入變數都設定完成。
