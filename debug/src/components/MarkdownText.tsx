import type { ReactNode } from "react";

interface MarkdownTextProps {
  text: string;
  isDark: boolean;
  compact?: boolean;
  className?: string;
}

type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "code"; text: string };

function parseInline(text: string, keyPrefix: string, isDark: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className={`rounded px-1 py-0.5 mono text-[0.92em] ${
            isDark ? "bg-slate-800/80 text-slate-100" : "bg-slate-100 text-slate-800"
          }`}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      const labelEnd = token.indexOf("](");
      const label = token.slice(1, labelEnd);
      const href = token.slice(labelEnd + 2, -1);
      nodes.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-2 opacity-90 hover:opacity-100"
        >
          {label}
        </a>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const paragraphLines: string[] = [];
  let codeLines: string[] | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length) {
      blocks.push({ type: "paragraph", lines: [...paragraphLines] });
      paragraphLines.length = 0;
    }
  };

  const sourceLines = text.replace(/\r\n/g, "\n").split("\n");

  for (const line of sourceLines) {
    if (line.trim().startsWith("```")) {
      if (codeLines) {
        blocks.push({ type: "code", text: codeLines.join("\n") });
        codeLines = null;
      } else {
        flushParagraph();
        codeLines = [];
      }
      continue;
    }

    if (codeLines) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      continue;
    }

    const unorderedMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    const orderedMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      const previous = blocks[blocks.length - 1];
      const item = unorderedMatch?.[1] ?? orderedMatch?.[1] ?? trimmed;
      if (previous?.type === "list" && previous.ordered === ordered) {
        previous.items.push(item);
      } else {
        blocks.push({ type: "list", ordered, items: [item] });
      }
      continue;
    }

    const quoteMatch = /^>\s?(.+)$/.exec(trimmed);
    if (quoteMatch) {
      flushParagraph();
      const previous = blocks[blocks.length - 1];
      if (previous?.type === "quote") {
        previous.lines.push(quoteMatch[1]);
      } else {
        blocks.push({ type: "quote", lines: [quoteMatch[1]] });
      }
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  if (codeLines) blocks.push({ type: "code", text: codeLines.join("\n") });
  return blocks;
}

export function MarkdownText({ text, isDark, compact = false, className = "" }: MarkdownTextProps) {
  const blocks = parseBlocks(text);
  const spacing = compact ? "space-y-1.5" : "space-y-3";

  return (
    <div className={`${spacing} break-words ${className}`}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "heading") {
          const size = block.level === 1 ? "text-base" : block.level === 2 ? "text-sm" : "text-xs";
          return (
            <div key={blockIndex} className={`${size} font-semibold tracking-tight`}>
              {parseInline(block.text, `heading-${blockIndex}`, isDark)}
            </div>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={blockIndex}
              className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{parseInline(item, `list-${blockIndex}-${itemIndex}`, isDark)}</li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={blockIndex}
              className={`border-l-2 pl-3 italic ${
                isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-600"
              }`}
            >
              {parseInline(block.lines.join(" "), `quote-${blockIndex}`, isDark)}
            </blockquote>
          );
        }

        if (block.type === "code") {
          return (
            <pre
              key={blockIndex}
              className={`overflow-x-auto rounded-lg border p-3 text-xs mono ${
                isDark
                  ? "border-slate-800 bg-slate-950/80 text-slate-300"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <code>{block.text}</code>
            </pre>
          );
        }

        return (
          <p key={blockIndex}>
            {parseInline(block.lines.map((line) => line.trim()).join(" "), `paragraph-${blockIndex}`, isDark)}
          </p>
        );
      })}
    </div>
  );
}
