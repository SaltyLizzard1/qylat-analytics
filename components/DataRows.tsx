import { C, RADIUS } from '@/lib/theme';
import { Empty } from '@/components/charts';

/**
 * Card rows with table alignment.
 *
 * Four views used plain striped tables while the leaderboard used card rows,
 * and tabbing between them made the inconsistency obvious. This gives one
 * idiom: CSS grid keeps columns aligned down the page the way a table does,
 * while each row is its own surface.
 *
 * Zebra striping is gone on purpose. It existed to help the eye track across a
 * wide row, which is a job the row's own border now does without painting every
 * other line a different colour.
 */

export type Column<T> = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Any CSS grid track value. Defaults to 1fr. */
  width?: string;
  bold?: boolean;
  render: (row: T) => React.ReactNode;
};

export function DataRows<T>({
  columns,
  rows,
  keyOf,
  emptyMessage = 'Nothing to show yet.',
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T, index: number) => string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) return <Empty message={emptyMessage} />;

  const template = columns.map((c) => c.width ?? '1fr').join(' ');

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 'min-content' }}>
        {/* Header. Not a card, so the rows below read as the content. */}
        <div
          className="grid gap-3 px-3 pb-2"
          style={{ gridTemplateColumns: template, borderBottom: `1px solid ${C.border}` }}
        >
          {columns.map((c) => (
            <span
              key={c.key}
              className="text-xs uppercase whitespace-nowrap"
              style={{
                color: C.muted,
                letterSpacing: '0.08em',
                textAlign: c.align ?? 'left',
              }}
            >
              {c.label}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2 mt-2">
          {rows.map((row, i) => (
            <div
              key={keyOf(row, i)}
              className="grid gap-3 items-center px-3 py-2.5"
              style={{
                gridTemplateColumns: template,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: RADIUS.md,
              }}
            >
              {columns.map((c) => (
                <div
                  key={c.key}
                  className="text-sm tabular-nums min-w-0"
                  style={{
                    textAlign: c.align ?? 'left',
                    color: C.text,
                    fontWeight: c.bold ? 600 : 400,
                  }}
                >
                  {c.render(row)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Small neutral tag, for platform and format labels inside a row. */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 whitespace-nowrap"
      style={{ background: C.neutral, color: C.muted, borderRadius: RADIUS.sm }}
    >
      {children}
    </span>
  );
}

/** Secondary text inside a row, for dates and counts. */
export function Sub({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs" style={{ color: C.muted }}>
      {children}
    </span>
  );
}
