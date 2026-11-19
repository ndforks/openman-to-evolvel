/** Renders a docs page's Markdown with anchored headings, site links through next/link and styled tables and code. */
import type { ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugify } from "../_lib/content";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

function Heading({ level, children }: { level: 2 | 3 | 4; children: ReactNode }) {
  const id = slugify(textOf(children));
  const Tag = `h${level}` as const;
  const size =
    level === 2
      ? "mt-[40px] mb-[12px] font-serif text-[24px] leading-[32px]"
      : level === 3
        ? "mt-[28px] mb-[8px] text-[17px] font-semibold leading-[24px]"
        : "mt-[20px] mb-[6px] text-[15px] font-semibold leading-[22px]";
  return (
    <Tag id={id} className={`group scroll-mt-[120px] text-[var(--om-text-1)] ${size}`}>
      {children}
      <a href={`#${id}`} aria-label="Link to this section" className="ml-[8px] text-[var(--om-text-4)] no-underline opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
        #
      </a>
    </Tag>
  );
}

const components: Components = {
  h1: ({ children }) => <Heading level={2}>{children}</Heading>,
  h2: ({ children }) => <Heading level={2}>{children}</Heading>,
  h3: ({ children }) => <Heading level={3}>{children}</Heading>,
  h4: ({ children }) => <Heading level={4}>{children}</Heading>,
  p: ({ children }) => <p className="my-[12px] text-[15px] leading-[25px] text-[var(--om-text-2)]">{children}</p>,
  a: ({ href = "", children }) => {
    const cls = "font-medium text-[var(--om-text-1)] underline decoration-[var(--om-text-4)] underline-offset-[3px] hover:decoration-[var(--om-text-1)]";
    if (href.startsWith("/") || href.startsWith("#")) {
      return (
        <Link href={href} className={cls}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  ul: ({ children }) => <ul className="my-[12px] list-disc space-y-[6px] pl-[22px] text-[15px] leading-[24px] text-[var(--om-text-2)] marker:text-[var(--om-text-4)]">{children}</ul>,
  ol: ({ children }) => <ol className="my-[12px] list-decimal space-y-[6px] pl-[22px] text-[15px] leading-[24px] text-[var(--om-text-2)] marker:text-[var(--om-text-3)]">{children}</ol>,
  li: ({ children }) => <li className="pl-[2px]">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--om-text-1)]">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="my-[16px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)] px-[16px] py-[4px] [&_p]:text-[14px] [&_p]:leading-[22px]">{children}</blockquote>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded-[5px] bg-[var(--om-fill)] px-[5px] py-[1px] font-mono text-[13px] text-[var(--om-text-1)]">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="my-[16px] overflow-x-auto rounded-[12px] bg-[#1a1a19] p-[16px] font-mono text-[13px] leading-[21px] text-[#e5e5e5]">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="my-[16px] overflow-x-auto rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)]">
      <table className="w-full border-collapse text-left text-[14px] leading-[20px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="whitespace-nowrap border-b border-[var(--om-border)] px-[12px] py-[9px] font-medium text-[var(--om-text-1)]">{children}</th>,
  td: ({ children }) => <td className="border-b border-[var(--om-border)] px-[12px] py-[9px] text-[var(--om-text-2)] [tr:last-child_&]:border-b-0">{children}</td>,
  hr: () => <hr className="my-[32px] border-[var(--om-border)]" />,
};

export function DocMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {markdown}
    </ReactMarkdown>
  );
}
