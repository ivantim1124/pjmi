# PJMI／鎮高機研

Astro 靜態社團網站，使用 GitHub Actions 部署至 GitHub Pages。

正式網址：<https://pjmi.dpdns.org>

比賽看板：<https://competitions.pjmi.dpdns.org>（Cloudflare Pages + D1 設定完成後啟用）

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

網站內容主要放在 `src/data/site.ts`，可替換社員、作品與活動資料。

## 比賽看板

`competition-board/` 是獨立的 Astro 子專案，包含公開比賽列表、Cloudflare Pages Functions API、D1 schema，以及受 Cloudflare Access 保護的管理介面。部署與 DNS／D1 操作請看 [`competition-board/README.md`](competition-board/README.md)。
