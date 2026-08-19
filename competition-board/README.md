# PJMI 比賽看板

這是一個獨立的 Astro 子專案，公開頁面與管理介面部署到 Cloudflare Pages，資料存放在 Cloudflare D1。

## 建議網址

- 公開看板：`https://competitions.pjmi.dpdns.org/`
- 管理介面：`https://competitions.pjmi.dpdns.org/admin/`

「比賽看板」是中文顯示名稱；DNS 子網域使用 `competitions`，比較容易輸入、分享，也避免 IDN/Punycode 在不同裝置上顯示不一致。

## Cloudflare 設定順序

1. 在 Cloudflare Workers & Pages 建立 Pages 專案，連結 GitHub `ivantim1124/pjmi`。
2. Build command 設為 `cd competition-board && npm install && npm run build`。
3. Build output directory 設為 `competition-board/dist`。
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

管理頁會顯示密碼登入畫面；只有登入成功的工作階段可以讀取、新增、編輯或刪除資料。公開看板不需要登入，也不需要 Cloudflare Zero Trust。

## 免費安全防護

- 登入失敗 5 次後，該來源會暫停登入 30 分鐘；紀錄使用不可逆雜湊，不儲存原始 IP。
- 管理工作階段有效 8 小時，Cookie 使用 `HttpOnly`、`Secure`、`SameSite=Strict` 與 `__Host-` 限制。
- 新增、修改、刪除與登出 API 只接受同源請求，並限制 JSON 請求大小。
- Pages middleware 與 `_headers` 會加入 CSP、防 iframe 點擊劫持、MIME 嗅探防護、權限限制與管理頁禁止快取。
- 所有 SQL 都使用參數綁定，公開資料在寫入 HTML 前會跳脫。

以上只使用 Cloudflare Pages Functions 與既有 D1 免費額度，不需要 Zero Trust、付費 WAF 或信用卡。建議 `ADMIN_PASSWORD` 至少 16 個字元且不要與其他服務共用；`ADMIN_SESSION_SECRET` 請使用 `openssl rand -hex 32` 產生。

## 本機預覽

```bash
npm install
npm run dev
```

Astro 頁面可以直接預覽；正式環境的資料來自 Cloudflare D1，管理 API 需要 Pages Functions、D1 與兩個登入變數都設定完成。
