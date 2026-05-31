import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const noteFile = path.join(rootDir, "笔记", "MIBC 围术期 ctDNA 动态监测联合 AI 病理项目笔记.md");
const noteDir = path.dirname(noteFile);
const outDir = path.join(rootDir, "public");
const outAssetsDir = path.join(outDir, "assets");

const pageTitle = "MIBC 围术期 ctDNA 动态监测联合 AI 病理项目笔记";

if (!fs.existsSync(noteFile)) {
  throw new Error(`Missing note file: ${noteFile}`);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outAssetsDir, { recursive: true });

const markdown = fs.readFileSync(noteFile, "utf8");
const headings = [];
const copiedAssets = new Map();

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(text) {
  const base = text
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return base || `section-${headings.length + 1}`;
}

function uniqueSlug(text) {
  const base = slugify(text);
  let slug = base;
  let count = 2;
  while (headings.some((heading) => heading.id === slug)) {
    slug = `${base}-${count}`;
    count += 1;
  }
  return slug;
}

function encodeAssetPath(relativePath) {
  return relativePath.split("/").map(encodeURIComponent).join("/");
}

function resolveAsset(target) {
  const cleanTarget = target.trim();
  if (copiedAssets.has(cleanTarget)) {
    return copiedAssets.get(cleanTarget);
  }

  const candidates = [
    path.join(noteDir, cleanTarget),
    path.join(rootDir, "笔记", cleanTarget),
    path.join("/Users/liluxuan/Documents/obsidian", cleanTarget),
  ];
  const source = candidates.find((candidate) => fs.existsSync(candidate));
  if (!source) {
    return null;
  }

  const outputRelative = cleanTarget.replace(/^\/+/, "");
  const outputPath = path.join(outAssetsDir, outputRelative);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(source, outputPath);

  const browserPath = `assets/${encodeAssetPath(outputRelative)}`;
  copiedAssets.set(cleanTarget, browserPath);
  return browserPath;
}

function renderObsidianImage(target, width) {
  const src = resolveAsset(target);
  if (!src) {
    return `<span class="missing-asset">缺失图片：${escapeHtml(target)}</span>`;
  }
  const numericWidth = width && /^\d+$/.test(width.trim()) ? Number(width.trim()) : null;
  const imageWidth = numericWidth ? Math.min(numericWidth, 620) : 560;
  const style = ` style="--image-width:min(100%, ${imageWidth}px)"`;
  const alt = escapeHtml(path.basename(target));
  return `<figure class="note-image"><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${alt}" loading="lazy"${style}></a></figure>`;
}

function renderMath(content, display = false) {
  const delimiter = display ? ["\\[", "\\]"] : ["\\(", "\\)"];
  return `<span class="${display ? "math-display-inline" : "math"}">${delimiter[0]}${escapeHtml(content.trim())}${delimiter[1]}</span>`;
}

function renderInline(value) {
  const placeholders = [];
  let text = value.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@INLINE_${placeholders.length}@@`;
    placeholders.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = text.replace(/\$\$([^$\n]+)\$\$/g, (_, math) => {
    const token = `@@INLINE_${placeholders.length}@@`;
    placeholders.push(renderMath(math, true));
    return token;
  });

  text = text.replace(/\$([^$\n]+)\$/g, (_, math) => {
    const token = `@@INLINE_${placeholders.length}@@`;
    placeholders.push(renderMath(math));
    return token;
  });

  text = escapeHtml(text);

  text = text.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, width) =>
    renderObsidianImage(target, width),
  );
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  for (const [index, html] of placeholders.entries()) {
    text = text.replace(`@@INLINE_${index}@@`, html);
  }
  return text;
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines, startIndex) {
  const header = splitTableRow(lines[startIndex]);
  const rows = [];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].includes("|") && lines[index].trim() !== "") {
    rows.push(splitTableRow(lines[index]));
    index += 1;
  }

  const thead = header.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
  const tbody = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
    .join("\n");
  return {
    html: `<div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`,
    nextIndex: index,
  };
}

function renderList(lines, startIndex, ordered) {
  const tag = ordered ? "ol" : "ul";
  const pattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*]\s+(.+)$/;
  const items = [];
  let index = startIndex;
  while (index < lines.length) {
    const match = lines[index].match(pattern);
    if (!match) break;
    items.push(`<li>${renderInline(match[1])}</li>`);
    index += 1;
  }
  return { html: `<${tag}>${items.join("\n")}</${tag}>`, nextIndex: index };
}

function renderMarkdown(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "") {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      html.push(`<pre><code class="language-${escapeHtml(language)}">${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const oneLineMath = trimmed.match(/^\$\$(.+)\$\$$/);
    if (oneLineMath) {
      html.push(`<div class="math-block">\\[${escapeHtml(oneLineMath[1].trim())}\\]</div>`);
      index += 1;
      continue;
    }

    if (trimmed === "$$") {
      const math = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "$$") {
        math.push(lines[index]);
        index += 1;
      }
      index += 1;
      html.push(`<div class="math-block">\\[${escapeHtml(math.join("\n"))}\\]</div>`);
      continue;
    }

    if (/^!\[\[[^\]]+\]\]$/.test(trimmed)) {
      html.push(renderInline(trimmed));
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      const id = uniqueSlug(title);
      headings.push({ level, title: title.replace(/[*`]/g, ""), id });
      html.push(`<h${level} id="${id}">${renderInline(title)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quote = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${quote.map((part) => `<p>${renderInline(part)}</p>`).join("")}</blockquote>`);
      continue;
    }

    if (trimmed.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const table = renderTable(lines, index);
      html.push(table.html);
      index = table.nextIndex;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const list = renderList(lines, index, false);
      html.push(list.html);
      index = list.nextIndex;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const list = renderList(lines, index, true);
      html.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^---+$/.test(lines[index].trim()) &&
      !lines[index].trim().startsWith("```") &&
      !lines[index].trim().startsWith(">") &&
      lines[index].trim() !== "$$" &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !/^!\[\[[^\]]+\]\]$/.test(lines[index].trim()) &&
      !(lines[index].includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1]))
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return html.join("\n");
}

const body = renderMarkdown(markdown);
const toc = headings
  .map((heading) => `<a class="toc-level-${heading.level}" href="#${heading.id}">${escapeHtml(heading.title)}</a>`)
  .join("\n");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <script>
    window.MathJax = {
      tex: { inlineMath: [["\\\\(", "\\\\)"]], displayMath: [["\\\\[", "\\\\]"]] },
      svg: { fontCache: "global" }
    };
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
  <style>
    :root {
      color-scheme: light;
      --ink: #172033;
      --muted: #667085;
      --line: #d9e0ea;
      --paper: #fbfaf7;
      --panel: #ffffff;
      --accent: #0f766e;
      --accent-soft: #dff6f1;
      --shadow: 0 18px 45px rgba(23, 32, 51, 0.08);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background:
        linear-gradient(90deg, rgba(15, 118, 110, 0.07) 1px, transparent 1px),
        linear-gradient(180deg, rgba(15, 118, 110, 0.05) 1px, transparent 1px),
        var(--paper);
      background-size: 44px 44px;
      color: var(--ink);
      font-family: "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif;
      line-height: 1.72;
    }

    .shell {
      display: grid;
      grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
      min-height: 100vh;
    }

    .shell.toc-collapsed {
      grid-template-columns: 0 minmax(0, 1fr);
    }

    aside {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow: auto;
      padding: 28px 22px;
      border-right: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.82);
      backdrop-filter: blur(14px);
      transition: opacity 160ms ease, transform 160ms ease, padding 160ms ease;
    }

    .shell.toc-collapsed aside {
      opacity: 0;
      overflow: hidden;
      padding-left: 0;
      padding-right: 0;
      pointer-events: none;
      transform: translateX(-16px);
    }

    .brand {
      margin-bottom: 24px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--line);
    }

    .brand .eyebrow {
      margin: 0 0 8px;
      color: var(--accent);
      font-family: "Avenir Next", "Helvetica Neue", sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .brand h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.32;
    }

    nav a {
      display: block;
      margin: 4px 0;
      padding: 6px 8px;
      border-radius: 6px;
      color: var(--muted);
      font-family: "Avenir Next", "Helvetica Neue", sans-serif;
      font-size: 13px;
      line-height: 1.35;
      text-decoration: none;
    }

    nav a:hover {
      background: var(--accent-soft);
      color: var(--accent);
    }

    .toc-level-1 { font-weight: 800; color: var(--ink); }
    .toc-level-2 { padding-left: 16px; }
    .toc-level-3, .toc-level-4, .toc-level-5, .toc-level-6 { padding-left: 30px; font-size: 12px; }

    main {
      padding: 42px clamp(22px, 5vw, 76px) 72px;
    }

    .toolbar {
      position: sticky;
      top: 12px;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 0 auto 18px;
      max-width: 980px;
      padding: 6px;
      border: 1px solid rgba(217, 224, 234, 0.72);
      border-radius: 8px;
      background: rgba(251, 250, 247, 0.84);
      backdrop-filter: blur(12px);
      font-family: "Avenir Next", "Helvetica Neue", sans-serif;
    }

    button {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
      color: var(--ink);
      cursor: pointer;
      font: inherit;
      padding: 8px 12px;
      box-shadow: 0 6px 16px rgba(23, 32, 51, 0.05);
    }

    button:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    article {
      max-width: 980px;
      margin: 0 auto;
      padding: clamp(22px, 4vw, 52px);
      border: 1px solid rgba(217, 224, 234, 0.9);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.93);
      box-shadow: var(--shadow);
    }

    details {
      margin: 10px 0;
      border-top: 1px solid rgba(217, 224, 234, 0.82);
    }

    details:first-child {
      border-top: 0;
    }

    summary {
      cursor: pointer;
      list-style: none;
      padding: 12px 0;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary::before {
      content: "+";
      display: inline-grid;
      place-items: center;
      width: 22px;
      height: 22px;
      margin-right: 10px;
      border: 1px solid var(--line);
      border-radius: 50%;
      color: var(--accent);
      font-family: "Avenir Next", "Helvetica Neue", sans-serif;
      font-weight: 700;
      vertical-align: middle;
    }

    details[open] > summary::before {
      content: "-";
      background: var(--accent-soft);
      border-color: var(--accent-soft);
    }

    summary h1, summary h2, summary h3, summary h4, summary h5, summary h6 {
      display: inline;
      margin: 0;
    }

    h1, h2, h3, h4, h5, h6 {
      line-height: 1.35;
      color: #111827;
    }

    h1 { font-size: clamp(28px, 4vw, 42px); }
    h2 { font-size: 26px; }
    h3 { font-size: 21px; }
    h4 { font-size: 18px; }

    p { margin: 12px 0; }
    strong { color: #0b4f49; }
    a { color: var(--accent); }

    blockquote {
      margin: 18px 0;
      padding: 14px 18px;
      border-left: 4px solid var(--accent);
      background: #f3faf8;
    }

    code {
      border-radius: 4px;
      background: #eef2f7;
      color: #344054;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.92em;
      padding: 0.1em 0.32em;
    }

    pre {
      overflow: auto;
      padding: 16px;
      border-radius: 8px;
      background: #111827;
      color: #f8fafc;
    }

    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }

    ul, ol { padding-left: 1.35rem; }

    .table-wrap {
      overflow-x: auto;
      margin: 18px 0;
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      font-size: 14px;
    }

    th, td {
      min-width: 120px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      border-right: 1px solid var(--line);
      vertical-align: top;
    }

    th {
      background: #f2f6f5;
      color: #163f3b;
      font-weight: 700;
      text-align: left;
    }

    tr:last-child td { border-bottom: 0; }
    th:last-child, td:last-child { border-right: 0; }

    .note-image {
      margin: 18px 0;
      text-align: center;
    }

    .note-image a {
      display: inline-block;
    }

    .note-image img {
      height: auto;
      max-width: var(--image-width, min(100%, 680px));
      max-height: min(430px, 68vh);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      object-fit: contain;
      box-shadow: 0 10px 30px rgba(23, 32, 51, 0.08);
    }

    .missing-asset {
      display: inline-block;
      padding: 6px 8px;
      border-radius: 6px;
      background: #fff4e6;
      color: #92400e;
      font-family: "Avenir Next", "Helvetica Neue", sans-serif;
      font-size: 13px;
    }

    .math-block {
      overflow-x: auto;
      margin: 18px 0;
      padding: 12px;
      border-radius: 8px;
      background: #f8fafc;
    }

    .math-display-inline {
      display: block;
      overflow-x: auto;
      max-width: 100%;
      margin: 12px 0;
      padding: 10px;
      border-radius: 8px;
      background: #f8fafc;
    }

    @media (max-width: 860px) {
      .shell {
        display: block;
      }

      aside {
        position: relative;
        height: auto;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }

      .shell.toc-collapsed aside {
        display: none;
      }

      nav {
        max-height: 220px;
        overflow: auto;
      }

      main {
        padding: 18px 14px 42px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside>
      <div class="brand">
        <p class="eyebrow">MIBC project note</p>
        <h1>${escapeHtml(pageTitle)}</h1>
      </div>
      <nav aria-label="目录">${toc}</nav>
    </aside>
    <main>
      <div class="toolbar">
        <button type="button" data-action="toggle-toc">收起目录</button>
        <button type="button" data-action="expand">展开全部</button>
        <button type="button" data-action="collapse">折叠全部</button>
      </div>
      <article class="content">
        ${body}
      </article>
    </main>
  </div>
  <script>
    function makeHeadingsCollapsible() {
      const article = document.querySelector(".content");
      const headings = Array.from(article.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      for (let index = headings.length - 1; index >= 0; index -= 1) {
        const heading = headings[index];
        const level = Number(heading.tagName.slice(1));
        const details = document.createElement("details");
        details.open = true;
        const summary = document.createElement("summary");
        summary.appendChild(heading.cloneNode(true));
        details.appendChild(summary);

        let node = heading.nextSibling;
        while (node) {
          const next = node.nextSibling;
          const isBlockingHeading = node.nodeType === 1 && /^H[1-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level;
          if (isBlockingHeading) break;
          details.appendChild(node);
          node = next;
        }

        heading.replaceWith(details);
      }
    }

    makeHeadingsCollapsible();

    const shell = document.querySelector(".shell");
    const tocButton = document.querySelector('[data-action="toggle-toc"]');
    tocButton.addEventListener("click", () => {
      const collapsed = shell.classList.toggle("toc-collapsed");
      tocButton.textContent = collapsed ? "显示目录" : "收起目录";
    });

    document.querySelector('[data-action="expand"]').addEventListener("click", () => {
      document.querySelectorAll("details").forEach((item) => { item.open = true; });
    });

    document.querySelector('[data-action="collapse"]').addEventListener("click", () => {
      document.querySelectorAll("details").forEach((item) => { item.open = false; });
    });
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, "index.html"), html);
console.log(`Built ${path.join(outDir, "index.html")}`);
