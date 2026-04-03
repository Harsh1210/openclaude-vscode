import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  /** Markdown text to render */
  content: string;
  /** Whether the content is still streaming (affects cursor display) */
  isStreaming?: boolean;
}

export function MarkdownRenderer({ content, isStreaming = false }: MarkdownRendererProps) {
  return (
    <div className="markdown-body prose prose-sm max-w-none text-vscode-fg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Custom component overrides for react-markdown.
 * Routes fenced code blocks to our CodeBlock component.
 */
const markdownComponents: Components = {
  // Override <pre> to strip the wrapper (CodeBlock handles its own <pre>)
  pre({ children }) {
    return <>{children}</>;
  },

  // Override <code> — inline code vs. block code
  code({ className, children, ...props }) {
    const isInline = !className && typeof children === 'string' && !children.includes('\n');

    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--vscode-textCodeBlock-background)]"
          {...props}
        >
          {children}
        </code>
      );
    }

    // Block code — extract text content and pass to CodeBlock
    const codeText = extractTextContent(children);

    return (
      <CodeBlock className={className} language={undefined}>
        {codeText}
      </CodeBlock>
    );
  },

  // Links open in VS Code's external browser
  a({ href, children }) {
    return (
      <a
        href={href}
        className="text-vscode-link hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },

  // Tables with VS Code styling
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full border-collapse border border-vscode-border text-sm">
          {children}
        </table>
      </div>
    );
  },

  th({ children }) {
    return (
      <th className="border border-vscode-border px-3 py-1.5 text-left font-semibold bg-[var(--vscode-editorGroupHeader-tabsBackground)]">
        {children}
      </th>
    );
  },

  td({ children }) {
    return (
      <td className="border border-vscode-border px-3 py-1.5">
        {children}
      </td>
    );
  },

  // Task list items (from remark-gfm)
  li({ children, ...props }) {
    // remark-gfm uses className 'task-list-item' for checkbox list items
    const isTaskItem = props.className?.includes('task-list-item');
    return (
      <li className={isTaskItem ? 'list-none' : undefined}>
        {children}
      </li>
    );
  },

  // Block quotes styled as callouts
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-vscode-link pl-4 my-2 opacity-80 italic">
        {children}
      </blockquote>
    );
  },
};

/**
 * Extract plain text from React children.
 * react-markdown passes the code content as nested children —
 * this flattens them to a string for our CodeBlock component.
 */
function extractTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractTextContent).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractTextContent((children as React.ReactElement).props.children);
  }
  return String(children ?? '');
}

