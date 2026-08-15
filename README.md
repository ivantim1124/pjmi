# pjmi／鎮高機研

Astro 靜態社團網站，使用 GitHub Actions 部署至 GitHub Pages。

正式網址：<https://pjmi.dpdns.org>

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
