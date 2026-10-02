# englishword／英文單字練習

獨立的 Astro + Cloudflare Pages 應用。使用者不需要登入即可選擇範圍練習；只有管理者登入後才能上傳單字表。

正式網址：<https://englishword.pjmi.dpdns.org>

## 選用 Google 試算表串接

管理後台已加入「Google 試算表串接」及唯讀連線檢查。預設停用，不影響既有 D1；啟用後瀏覽計數可切到 Google，測驗開始紀錄可選擇同步，但每日 20 次授權限制仍使用 D1。完整 Script、Secret 設定及免費額度限制見 [`設定指南`](../integrations/google-sheets/設定指南.md)。

## 功能

- 依單字範圍與題數開始練習。
- 可選單篇課次、整場段考、單獨課本／雜誌，或自由勾選多個課次組合。
- 依 `學年度-學期-段考-課次(課本或雜誌)` 編號自動整理段考組合，例如 `115-1-1-6(雜誌)` 會歸入 `115-1-1`。
- 拼字、中選英、英選中三種題型。
- 完成後顯示總題數、答對題數、正確率與錯題。
- 錯題可單獨重新練習。
- 可搜尋英文、中文解釋、例句或課次名稱，並從結果快速選取課次。
- 練習首頁顯示累計瀏覽次數（每次載入首頁計 1 次）。
- 單字來源檔依段考分資料夾保存，網站會依學年度、學期、段考、課次的數字順序顯示。
- 單字庫中的段考資料夾可展開／收合；課本與雜誌會在各自區塊中獨立排序，不會交錯顯示。
- 搜尋不到站內英文單字時，會自動開啟 Cambridge Dictionary，畫面也會保留手動開啟連結。
- 管理者使用 email／密碼登入後上傳 UTF-8 CSV 或 TSV；伺服器會掃描檔名、MIME、UTF-8 編碼、控制字元、CSV／TSV 結構、公式注入與疑似 HTML／腳本內容，通過後才寫入 D1。
- 相同「範圍＋英文單字」會更新原資料，不會刪除其他範圍。
- Pages Functions 處理登入、單字 API 與上傳；Cloudflare D1 儲存單字。

## 表格格式

必要欄位：`range`、`word`、`meaning`。

選填欄位：`example`、`phonetic`、`part_of_speech`。

上傳限制：只接受 `.csv`／`.tsv` 純文字檔，檔案上限 2 MB、單次最多 5000 筆、每列最多 12 欄；不接受 `.xlsx`、ZIP 或其他二進位檔。Excel 或 Numbers 請先匯出成 UTF-8 CSV 再上傳。

欄位也接受常見中文名稱，例如 `範圍`、`英文`、`中文`、`例句`、`音標`、`詞性`。可以直接下載管理頁的表格範例，使用 Excel 或 Numbers 編輯後匯出成 UTF-8 CSV 再上傳。

```csv
range,word,meaning,example,phonetic,part_of_speech
第一冊 Lesson 1,adapt,適應；調整,We need to adapt to the new schedule.,əˈdæpt,verb
```

## 單字資料夾與編號

每一次段考使用一個資料夾，資料夾名稱固定為：

`學年度-學期-段考`

課本與雜誌檔案名稱固定為：

`學年度-學期-段考-課次(課本或雜誌).csv`

例如：

```text
115-1-1/
├── 115-1-1-1(課本).csv
├── 115-1-1-1(雜誌).csv
├── 115-1-1-2(課本).csv
└── 115-1-1-2(雜誌).csv
```

網站上的段考選單會以資料夾名稱（例如 `115-1-1`）合併同一場段考；課次會以數字排序，課本排在雜誌之前。資料夾是原始 CSV 的保存方式，匯入 D1 後仍以 `range` 欄位中的完整檔名作為範圍識別。

## Cloudflare 部署步驟

### 1. 建立 Pages 專案（不需要 GitHub）

這個專案使用 Cloudflare Direct Upload。因為它包含 `functions/` Pages Functions，請從 `englishword` 根目錄使用 Wrangler，不要使用 Cloudflare Dashboard 的拖拉上傳；拖拉方式目前不會編譯 Pages Functions。

如果終端機目前顯示的是家目錄 `~`，請先切換到本專案的 `englishword` 資料夾；`cd englishword` 只有在你已經位於 `pjmi` 父資料夾時才有效。

```bash
cd englishword
npm install
npx wrangler login
npx wrangler pages project create englishword
```

`pages project create` 只需第一次執行。完成 D1 與 Secrets 設定後，再執行 `npm run deploy`。部署指令必須從這個目錄執行，Wrangler 才會一起偵測並上傳 `functions/`。

### 2. 建立 D1 資料庫

在本機執行：

```bash
cd englishword
npx wrangler login
npx wrangler d1 create pjmi-englishword
```

把指令回傳的 `database_id` 填入 `wrangler.toml` 的 `database_id`，取代 `REPLACE_WITH_D1_DATABASE_ID`。

初始化資料表：

```bash
npx wrangler d1 execute pjmi-englishword --remote --file=./schema.sql
```

本專案的 `wrangler.toml` 已經宣告 `DB` binding，填好 `database_id` 後由 `npm run deploy` 一起套用。如果想從 Dashboard 確認，位置是 Pages 專案的 Settings → Bindings → Add → D1 database bindings：

- Variable name：`DB`
- Database：`pjmi-englishword`

如果找不到 `Bindings`，不需要卡在 Dashboard：請確認你已進入 **Workers & Pages → englishword 這個 Pages 專案**，不是帳號層級的 D1 頁面；而且 D1 必須先建立完成。新版介面位置是 `Settings → Bindings → Add → D1 database bindings`。

### 3. 設定管理者 Secrets

不需要找 Dashboard 選單，直接使用下列 Wrangler 指令設定最清楚：

管理者帳號不是寫在程式碼裡，請用加密 Secret：

```bash
npx wrangler pages secret put ADMIN_EMAIL --project-name englishword
npx wrangler pages secret put ADMIN_PASSWORD --project-name englishword
npx wrangler pages secret put ADMIN_SESSION_SECRET --project-name englishword
```

輸入值時請準備：

- `ADMIN_EMAIL`：你的管理者 email。
- `ADMIN_PASSWORD`：至少 16 個字元、不要與其他服務共用的密碼。
- `ADMIN_SESSION_SECRET`：可用 `openssl rand -hex 32` 產生的隨機字串。

這些值不要提交到 GitHub，也不要放入 `.dev.vars.example` 以外的版本控制檔案。

### 4. 部署網站

確認 D1 與三個 Secrets 都已設定後，在 `englishword` 根目錄執行：

```bash
npm run deploy
```

這會先建置 Astro，再部署 `dist/` 和 `functions/`。

### 5. 綁定子網域

第一次部署完成後，務必先在 Pages 專案的 Custom domains → Set up a domain 加入：

`englishword.pjmi.dpdns.org`

完成上述 custom domain 流程後，若 Cloudflare 沒有自動建立 DNS，再新增一筆 DNS CNAME：

- Name：`englishword`
- Target：Cloudflare Pages 提供的 `*.pages.dev` 網址
- Proxy status：Proxied

不要只手動新增 CNAME 而跳過 Pages 的 Custom domains 綁定流程，否則網域可能無法解析。

### 6. 建議加入 API 限流（只在你能管理 Cloudflare zone 時）

Cloudflare → `pjmi.dpdns.org` → Security → Security rules → Rate limiting rules：

- 條件：URI Path starts with `/api/`
- 免費方案：每個來源每 10 秒最多 20 次，Action 使用 Block 10 秒。
- Pro／Business：另外為 `/api/auth/login` 設定較嚴格的登入限流。

程式本身也會限制登入失敗次數：同一來源 15 分鐘內失敗 5 次後暫停約 30 分鐘。公開單字與搜尋 API 使用固定快取鍵在 Cloudflare 邊緣快取，避免用隨機查詢字串反覆打到 D1；API URL 限制為 2048 字元，POST／匯入請求先限制約 3 MiB。瀏覽次數改為同一瀏覽器 30 分鐘只計一次，並對已計數讀取使用短邊緣快取。這些是補強，不取代 Cloudflare 邊緣層防護。

目前 `wrangler.toml` 的 `BLOCK_NON_TW_SITE = "1"` 會讓 Cloudflare 能辨識國家的情況下，只允許台灣（TW）來源載入整個網站；海外來源會直接看到「目前不支援您所在的國家／地區」的 403 頁面。`BLOCK_NON_TW_API = "1"` 會再對 API 維持同樣的限制。若你要允許海外學生練習，將兩個設定都改成 `"0"` 後重新部署。

完整的 DDoS、WAF、國家封鎖、Pages 預覽網址與限流設定請看本專案的 [`SECURITY.md`](SECURITY.md)。如果 `pjmi.dpdns.org` 是別人管理的父網域，你不能在自己的 Cloudflare 帳號替它建立 zone WAF 規則；此時仍保留程式層的台灣 API 限制，但要請父網域管理者代設邊緣規則。

## 每日測驗額度

每個 IP 和本站簽發的瀏覽器裝置 Cookie 各限每天 20 次；任一額度用完就不能開始新的測驗。每天依 `Asia/Taipei` 時間 00:00 重置。開始一次測驗即計次，提早離開不退還；「只練錯題」也算一次，預習及搜尋不計次。共用網路會共用 IP 額度。裝置代號代表瀏覽器，並非不可變的硬體識別碼；清除 Cookie 後仍受原 IP 額度限制。

前端每次開始前呼叫 `POST /api/quiz/start`；伺服器以單一條件式 SQL 同時檢查兩個額度並記錄，不會因多分頁同時送出而超過 20 次。`GET /api/quiz/quota` 只讀額度及簽發裝置 Cookie，所有額度回應禁止快取。達上限回傳 HTTP 429 和下次重置時間，驗證服務故障則停止開始測驗。裝置 Cookie 以既有 `ADMIN_SESSION_SECRET` 簽章，IP 與裝置代號以分開用途的 HMAC 儲存；紀錄保留約 30 天，下次成功開始測驗時清理舊紀錄。

這是本站測驗開始流程的限額；公開的預習單字 API 仍可讀取，無法禁止使用者將單字複製到自己的程式中練習。沒有新增或啟用付費產品。

既有網站啟用前先執行新增資料表檔案：

```bash
wrangler d1 execute pjmi-englishword --remote --file migrations/20260930_quiz_quota.sql
```

新的資料庫直接使用完整 `schema.sql`。驗證可執行 `node --test tests/quiz-quota.test.mjs`。

## 本機預覽

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

`npm run dev` 可以預覽介面；沒有連接 D1 時首頁會顯示預覽資料。正式環境則由 `/api/words` 讀取 D1。

正式部署可在 `englishword` 目錄執行 `npm run deploy`。這會先建置 Astro，再部署 `dist/` 和 `functions/`。

第一次啟用前，請確認 D1 schema、`DB` binding 與三個 Secrets 都已設定。
