# MIBC 项目笔记

这个仓库发布 MIBC 围术期 ctDNA 动态监测联合 AI 病理项目笔记。

## 在线网页

发布地址：

https://raillee.github.io/mibc/

## 如何维护

1. 修改 `notes/MIBC 围术期 ctDNA 动态监测联合 AI 病理项目笔记.md`
2. 本地预览时运行：

```bash
node scripts/build-site.mjs
```

3. 提交并推送到 GitHub 后，GitHub Pages 会自动更新网页。

## 文件说明

- `notes/`：可编辑 Markdown 笔记和图片素材。
- `public/`：自动生成的网页文件。
- `scripts/build-site.mjs`：把 Markdown 转成可折叠网页。
- `.github/workflows/pages.yml`：GitHub Pages 自动发布配置。
