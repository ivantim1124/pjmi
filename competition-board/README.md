# PJMI 比賽看板

這是一個獨立的 Astro 子專案，公開頁面與管理介面部署到 Cloudflare Pages，資料存放在 Cloudflare D1。

## 建議網址

- 公開看板：`https://competitions.pjmi.dpdns.org/`
- 管理介面：`https://competitions.pjmi.dpdns.org/admin/`

「比賽看板」是中文顯示名稱；DNS 子網域使用 `competitions`，比較容易輸入、分享，也避免 IDN/Punycode 在不同裝置上顯示不一致。

## Cloudflare 設定順序

1. 在 Cloudflare Workers & Pages 建立 Pages 專案，連結 GitHub `ivantim1124/pjmi`。
2. Build root directory 設為 `competition-board`。
3. Build command 設為 `npm run build`，Build output directory 設為 `dist`。
4. Pages 專案完成第一次部署後，在 Custom domains 加入 `competitions.pjmi.dpdns.org`。
5. 在 DNS 建立 `competitions` 的 CNAME，指向 Cloudflare Pages 提供的 `*.pages.dev` 網址。
6. 建立 D1：

   ```bash
   cd competition-board
   npx wrangler login
   npx wrangler d1 create pjmi-competitions
   ```

   把指令回傳的 `database_id` 填入 `wrangler.toml`，取代 `REPLACE_WITH_D1_DATABASE_ID`。

7. 初始化資料表與目前已知的活動紀錄：

   ```bash
   npx wrangler d1 execute pjmi-competitions --remote --file=./schema.sql
   npx wrangler d1 execute pjmi-competitions --remote --file=./seed.sql
   ```

8. 在 Pages 專案的 Settings → Variables and Secrets 加入 `ADMIN_EMAIL`，填入你的管理者 Google／Email 登入信箱。
9. 在 Cloudflare Zero Trust → Access 建立兩個 Self-hosted applications，保護：
   - `https://competitions.pjmi.dpdns.org/admin*`
   - `https://competitions.pjmi.dpdns.org/api/admin/*`

   Policy 使用 Allow，Include 只放你的管理者信箱。先設定 Pages custom domain，再加 Access policy。

管理頁與管理 API 都會檢查 Cloudflare Access 注入的管理者信箱；即使有人直接使用 `*.pages.dev` 預覽網址，也不能進入管理介面或修改資料。

## 本機預覽

```bash
npm install
npm run dev
```

Astro 頁面可以直接預覽；未連接 D1 時，公開頁面會顯示內建的預覽資料，管理 API 需要 Cloudflare Pages Functions 與 D1 綁定後才會啟用。
