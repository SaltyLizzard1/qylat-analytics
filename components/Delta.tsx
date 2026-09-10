import { severityGood, severityBad } from '@/lib/severity';
import { C } from '@/lib/theme';

/**
 * Period over period change.
 *
 * Colour here is still status: up is good for every metric this is used on
 * (views, clicks, sessions, followers, engagement), so green up and red down
 * agrees with the rest of the dashboard rather than inventing a third meaning.
 * If a metric ever arrives where down is good, pass `invert`.
 *
 * The arrow is a second, non-colour encoding of direction, so the change is
 * readable in greyscale and to anyone who cannot separate red from green.
 */
export function Delta({
  current,
  previous,
  invert = false,
  suffix = 'vs previous',
}: {
  current: number;
  previous: number;
  invert?: boolean;
  suffix?: string;
}) {
  // No prior period to compare against. Saying "+100%" from a base of zero is
  // meaningless, and "infinite growth" is worse.
  if (previous === 0) {
    return (
      <span className="text-xs whitespace-nowrap" style={{ color: C.muted }}>
        {current > 0 ? 'no prior period to compare' : 'no data yet'}
      </span>
    );
  }

  const change = (current - previous) / previous;
  const flat = Math.abs(change) < 0.005;
  const good = invert ? change < 0 : change > 0;
  const colour = flat ? C.muted : good ? severityGood.color : severityBad.color;
  const arrow = flat ? '' : change > 0 ? '▲' : '▼';

  return (
    <span
      className="text-xs whitespace-nowrap tabular-nums"
      style={{ color: colour, fontWeight: 600 }}
      title={`${current.toLocaleString()} against ${previous.toLocaleString()} in the previous period`}
    >
      {arrow && <span aria-hidden>{arrow} </span>}
      {flat ? 'level' : `${Math.abs(change * 100).toFixed(0)}%`}
      <span style={{ color: C.muted, fontWeight: 400 }}> {suffix}</span>
    </span>
  );
}
