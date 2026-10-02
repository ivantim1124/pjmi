# englishword 安全設定

本專案的安全策略分成兩層：程式在 Cloudflare Pages Functions 先拒絕不必要的請求，Cloudflare WAF／DDoS 再在邊緣攔截大量流量。程式層不能替代上游 DDoS 清洗，因此正式網域必須持續經過 Cloudflare。

## 已加入的程式層防護

- 2026-09-30：頁面、資產與 API 的 Pages middleware 加入共用已知 VPN／Tor 檢查；正式網址前也有免費 Worker Route。命中回覆 403，提示關閉 VPN／代理；沿用每天每 IP／裝置最多 20 次測驗限制。資料來源、背景更新、誤判與 IPv6 限制見主專案 `SECURITY.md` 的 VPN／代理防護章節。停用國家限制不等於停用 VPN 檢查。

- `public/_routes.json` 讓所有路徑進入 Pages Functions，middleware 會先檢查國家限制，再交給 Astro 靜態資產或 API；因此網站頁面、CSS、JavaScript 與 API 都能套用同一層安全標頭。
- `BLOCK_NON_TW_SITE = "1"` 時，Cloudflare 能辨識國家的非台灣來源會收到自訂 403「目前不支援您所在的國家／地區」頁面，不會載入網站內容；若 Cloudflare 沒有提供國家資訊則不誤封。
- `/api/*` 採白名單路由與 HTTP method；不存在的 API、錯誤 method、過長 URL（2048 字元）會在進入 D1 前拒絕。
- POST／PUT／PATCH 的已宣告 body 超過 3 MiB 會直接回覆 413；匯入 API 仍有更嚴格的 2 MiB／5000 筆限制。
- 管理者匯入只接受 `.csv`／`.tsv`；伺服器會檢查 multipart content type、檔名、UTF-8 編碼、CSV／TSV 純文字與常見二進位檔案簽名、控制字元、欄位／列數、必要欄位、欄位長度、疑似試算表公式與 HTML／腳本標籤，全部通過後才寫入 D1。不接受 `.xlsx`、ZIP 或其他二進位檔。
- 所有 API 都使用同源驗證、管理 API 使用簽章工作階段；登入失敗限制與 D1 記錄保留。
- 單字清單與搜尋結果使用固定的 Cloudflare Cache API key；搜尋輸入最多 80 字元、回傳最多 100 筆，降低隨機 query 造成的 D1 壓力。
- 瀏覽次數使用 `__Host-englishword_viewed` cookie，同一瀏覽器 30 分鐘只計一次；已計數的讀取使用短邊緣快取，避免每次重整都寫入 D1。
- 每日測驗由 D1 限制同一 IP 或簽章裝置 Cookie 最多 20 次，台灣時間 00:00 重置。`POST /api/quiz/start` 採單一 SQL 原子檢查及記錄，達上限回覆 429／Retry-After；資料庫或裝置驗證失效時拒絕開始。預習、搜尋不計次，錯題重練計次，所有額度回應禁止快取。
- `BLOCK_NON_TW_API = "1"` 時，Pages Functions 會依 Cloudflare 提供的國家資訊拒絕非台灣來源的 `/api/*`；若 Cloudflare 沒有提供國家資訊則不誤封，仍應搭配 WAF 國家規則。
- 已加入 CSP、HSTS、`X-Frame-Options`、`nosniff`、跨來源隔離、Referrer Policy、Permissions Policy，以及 `robots.txt` 對 API／管理頁的禁止爬取指示。

## Cloudflare 控制台必做設定

以下設定需要 `pjmi.dpdns.org` 的 Cloudflare zone 管理權。若這個父網域不是你的 zone，請把下面規則交給父網域管理者建立。

### 1. 確認 Pages 預覽網址不公開

在 Workers & Pages → `englishword` → Settings → General，對 preview deployments 啟用 Access policy。Production 的 `*.pages.dev` 網址則在 Bulk Redirects 轉址到正式網址：

```text
https://englishword-mhe.pages.dev/*
→ https://englishword.pjmi.dpdns.org/$1
```

保留 query string、path suffix，並使用 301。若控制台顯示的 Pages 專案網址不同，請以控制台顯示的網址取代上面的來源。

### 2. 保持 DDoS 與 Managed Rules 開啟

在 Security → WAF／DDoS protection：

- HTTP DDoS Attack Protection 保持預設 mitigation action 與 High sensitivity。
- Free Managed Ruleset 保持啟用。
- Security Events 出現誤判時先觀察，再針對單一規則調整，不要關閉整組 DDoS protection。

Cloudflare 的標準 DDoS 防護是邊緣層自動防護；WAF custom rules 與 rate limiting 是額外的應用層防線。

### 3. 台灣 API 地理限制

Security → Security rules → Custom rules → Create rule，名稱可填 `englishword-api-taiwan-only`。

Expression：

```text
(http.host eq "englishword.pjmi.dpdns.org" and ip.src.country ne "TW" and starts_with(http.request.uri.path, "/api/"))
```

Action：`Block`。

如果需要海外學生使用，改成 `Managed Challenge` 或停用此規則，並把 `wrangler.toml` 的 `BLOCK_NON_TW_API` 與 `BLOCK_NON_TW_SITE` 都改成 `"0"` 後重新部署；兩層要保持一致。

### 4. API 限流

在 Security → Security rules → Rate limiting rules 建立規則。方案可用欄位與規則數量會不同；免費方案通常只有一條規則且時間窗較短，先用以下保守門檻：

```text
條件：URI Path starts with /api/
門檻：每個來源 10 秒 20 次
超過後：Block 10 秒
```

Pro／Business 可再建立：

```text
條件：(http.request.uri.path eq "/api/auth/login" and http.request.method eq "POST")
門檻：每個 IP 5 分鐘 5 次
超過後：Block 15 分鐘
```

若控制台提供 `IP`／`Source IP` characteristic，請選它；若免費方案不提供，使用控制台預設的來源特性。不要對整個首頁設定低門檻限流，否則會誤傷正常學生。

### 5. 其他基礎設定

- DNS／Pages custom domain 維持 Cloudflare proxied 狀態。
- SSL/TLS → Overview 使用 `Full (strict)`；開啟 Always Use HTTPS，最低 TLS 版本使用 1.2 或以上。
- Security → Bots：若方案提供 Bot Fight Mode，啟用它；先觀察 Security Events，再調整誤判。
- 不要在公開 API 回應中加入 D1 binding、Secrets、錯誤堆疊或管理者資訊。

## 驗收方式

部署後檢查：

```bash
curl -I https://englishword.pjmi.dpdns.org/
curl -i -X POST https://englishword.pjmi.dpdns.org/api/words
curl -i "https://englishword.pjmi.dpdns.org/api/words?q=route"
```

第二個請求應被 middleware 回覆 `405`；第三個請求只回傳公開單字資料。若要確認國外來源限制，請使用自己的合法海外測試環境或 Cloudflare Security Events，不要用壓力測試工具攻擊正式網址。

## 邊界與注意事項

- DDoS 洪水必須由 Cloudflare 網路在進入 Pages 前處理；Pages Functions 只能降低 API／D1 被濫用的風險。
- `robots.txt` 只約束遵守規則的爬蟲，不是安全機制。
- 裝置 Cookie 識別瀏覽器，無法辨識不可變的實體硬體。清除 Cookie 仍受 IP 限額影響；共用網路會共用 IP 額度。同時更換網路與瀏覽器身分無法在免登入情況下確認是同一人。測驗限額控制本站開始流程，不會禁止複製公開預習單字在站外練習。
- 國家辨識依 IP，VPN、行動網路與代理可能被判到其他國家；要臨時開放海外使用，請先關閉國家限制規則，再把程式設定的 `BLOCK_NON_TW_API` 與 `BLOCK_NON_TW_SITE` 改為 `"0"`。
