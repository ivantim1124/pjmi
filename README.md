# PJMI／鎮高機研

Astro 靜態社團網站，使用 GitHub Actions 部署至 GitHub Pages。

正式網址：<https://pjmi.dpdns.org>

比賽看板：<https://competitions.pjmi.dpdns.org>（Cloudflare Pages + D1 設定完成後啟用）

若 Cloudflare Pages 沒有顯示 Root directory，請將比賽看板 Pages 專案的建置設定改為：Build command `cd competition-board && npm install && npm run build`，Build output directory `competition-board/dist`。

## 本機開發

```bash
npm install
npm run dev
```

## 驗證

```bash
npm run check
npm run build
```

## GitHub Pages

- GitHub repository：`ivantim1124/pjmi`
- GitHub Pages source：GitHub Actions
- Custom domain：`pjmi.dpdns.org`
- Cloudflare DNS：`@` 與 `www` CNAME 指向 `ivantim1124.github.io`

主頁僅保留比賽專區與單字練習入口；網址設定放在 `src/data/site.ts`。關於、社員與活動舊頁已改成回到主頁的靜態轉址，不再發布舊內容。404 頁也使用相同的簡潔版介面，不顯示舊導覽或頁尾；Cloudflare 的 403 國家／VPN 封鎖保持獨立且不變。

## 比賽看板

`competition-board/` 是獨立的 Astro 子專案，包含公開比賽列表、Cloudflare Pages Functions API、D1 schema，以及密碼登入的管理介面。部署與 DNS／D1 操作請看 [`competition-board/README.md`](competition-board/README.md)。
