import { freshness } from '@/lib/freshness';
import { THRESHOLDS } from '@/lib/status';
import { C, shortDateTime } from '@/lib/theme';

/**
 * When a figure was read, beside the figure: "Read 4 h ago", and for a
 * reading taken while the post was still young, how long after publishing,
 * since that reading says more about the post's age than about the post.
 * With `exact` the clock time is written out as well. It is always in the
 * title, so hovering gives it.
 */
export function ReadAge({
  readAt,
  publishedAt,
  exact = false,
  lower = false,
}: {
  readAt: string | Date | null;
  publishedAt: string | Date | null;
  exact?: boolean;
  /** "read" in place of "Read", for the middle of a line. */
  lower?: boolean;
}) {
  const f = freshness(readAt, publishedAt, THRESHOLDS.formatAgeHours);
  if (!f) return <span>{lower ? 'not read yet' : 'Not read yet'}</span>;
  return (
    <span title={`Read ${shortDateTime(readAt)}`}>
      {lower ? 'read' : 'Read'} {exact ? `${shortDateTime(readAt)}, ` : ''}
      {f.ago}
      {f.after && (
        <>
          {' · '}
          <span style={{ color: C.text, fontWeight: 500 }}>{f.after}</span>
        </>
      )}
    </span>
  );
}
