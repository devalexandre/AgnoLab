// Minimal, dependency-free Markdown -> HTML renderer used across the app.
// Extracted from App.tsx; these are pure string helpers plus a leaf component.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function parseMarkdownTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return [];
  }

  const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return normalized.split("|").map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = parseMarkdownTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function getMarkdownTableAlignment(cell: string): "left" | "center" | "right" {
  const normalized = cell.replace(/\s+/g, "");
  const startsWithColon = normalized.startsWith(":");
  const endsWithColon = normalized.endsWith(":");

  if (startsWithColon && endsWithColon) {
    return "center";
  }
  if (endsWithColon) {
    return "right";
  }
  return "left";
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let codeLines: string[] = [];
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listItems.length || !listType) {
      return;
    }
    blocks.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listItems = [];
    listType = null;
  };

  const flushCode = () => {
    if (!codeLines.length) {
      return;
    }
    blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const nextLine = lines[index + 1] ?? "";
    const headerCells = parseMarkdownTableCells(line);
    if (
      headerCells.length > 0 &&
      headerCells.every(Boolean) &&
      isMarkdownTableSeparator(nextLine) &&
      parseMarkdownTableCells(nextLine).length === headerCells.length
    ) {
      flushParagraph();
      flushList();

      const alignments = parseMarkdownTableCells(nextLine).map(getMarkdownTableAlignment);
      const bodyRows: string[] = [];
      let bodyIndex = index + 2;

      while (bodyIndex < lines.length) {
        const bodyLine = lines[bodyIndex];
        if (!bodyLine.trim()) {
          break;
        }

        const bodyCells = parseMarkdownTableCells(bodyLine);
        if (bodyCells.length !== headerCells.length) {
          break;
        }

        bodyRows.push(
          `<tr>${bodyCells
            .map(
              (cell, cellIndex) =>
                `<td style="text-align:${alignments[cellIndex] ?? "left"}">${renderInlineMarkdown(cell)}</td>`,
            )
            .join("")}</tr>`,
        );
        bodyIndex += 1;
      }
      index = bodyIndex - 1;

      blocks.push(
        `<div class="markdown-table-wrap"><table><thead><tr>${headerCells
          .map(
            (cell, cellIndex) =>
              `<th style="text-align:${alignments[cellIndex] ?? "left"}">${renderInlineMarkdown(cell)}</th>`,
          )
          .join("")}</tr></thead>${bodyRows.length ? `<tbody>${bodyRows.join("")}</tbody>` : ""}</table></div>`,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    if (listType) {
      flushList();
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCode();
  return blocks.join("");
}

export function MarkdownRenderer({ text, className }: { text: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />;
}
