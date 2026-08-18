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

8. 在 Pages 專案的 Settings → Variables and Secrets → Production 加入兩個加密變數：
   - `ADMIN_PASSWORD`：你自行設定的管理密碼。
   - `ADMIN_SESSION_SECRET`：長且隨機的登入工作階段密鑰，可用 `openssl rand -hex 32` 產生。

   這兩個值不要提交到 GitHub，也不要貼在公開訊息中。儲存後重新部署 Pages 專案。

管理頁會顯示密碼登入畫面；只有登入成功的工作階段可以讀取、新增、編輯或刪除資料。公開看板不需要登入，也不需要 Cloudflare Zero Trust。

## 本機預覽

```bash
npm install
npm run dev
```

Astro 頁面可以直接預覽；正式環境的資料來自 Cloudflare D1，管理 API 需要 Pages Functions、D1 與兩個登入變數都設定完成。
