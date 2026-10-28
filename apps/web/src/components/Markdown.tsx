import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-${index}`} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}

/** Tiny renderer: paragraphs, bold, and line breaks. Enough for the passages. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div
      className={cn(
        'reading-body text-[15px] leading-7 text-slate-700 [&>p:last-child]:mb-0',
        className,
      )}
    >
      {blocks.map((block, index) => (
        <p key={index}>
          {block.split('\n').map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {renderInline(line, `${index}-${lineIndex}`)}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
