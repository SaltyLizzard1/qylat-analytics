import { sql } from '@/lib/db';
import { C, CARD, RADIUS, TITLE, EYEBROW, shortDate, shortDateTime, platformColor } from '@/lib/theme';
import { severityBad } from '@/lib/severity';
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_REASON,
  getClickCountsTotal,
  getRulesVersion,
  getStaleRowCount,
  getRecentFailures,
  type Classification,
} from '@/lib/clicks';
import { TestToggle, SessionToggle, ReclassifyButton } from './ClickControls';

export const dynamic = 'force-dynamic';

/**
 * The raw log. The one page that reads click_events directly rather than the
 * human_clicks view, because its job is to show what was recorded, including
 * everything that is not counted.
 *
 * Classification is shown as a word, never as a colour alone. The four states
 * are mutually exclusive and sum to the total, so the arithmetic on this page
 * can be checked by eye against the reconciliation query in
 * db/reconcile_clicks.sql.
 */
export default async function ClicksPage() {
  const [counts, rules, stale, failures] = await Promise.all([
    getClickCountsTotal(),
    getRulesVersion(),
    getStaleRowCount(),
    getRecentFailures(20),
  ]);

  const clicks = await sql`
    SELECT
      ce.id,
      ce.slug,
      ce.clicked_at,
      ce.referrer,
      ce.user_agent,
      ce.country,
      ce.session_id,
      ce.classification,
      ce.is_test,
      ce.rules_version,
      l.platform,
      l.format,
      l.cta_type,
      COUNT(*) OVER (PARTITION BY ce.session_id)::int AS session_hits
    FROM click_events ce
    LEFT JOIN links l ON ce.slug = l.slug
    ORDER BY ce.clicked_at DESC
    LIMIT 200
  `;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl" style={TITLE}>
          Click Log
        </h1>
        <p className="text-sm mt-1" style={{ color: C.muted }}>
          Every /go/ hit ever recorded, counted or not. Nothing here is ever deleted.
          Showing the most recent 200 of {counts.total}.
        </p>
      </div>

      <CountsBar counts={counts} />

      <RulesNotice rules={rules} stale={stale} />

      {failures.length > 0 && <FailureNotice failures={failures} />}

      {clicks.length === 0 ? (
        <div
          className="text-center py-16"
          style={{ background: C.neutral, border: `1px dashed ${C.border}`, borderRadius: RADIUS.md }}
        >
          <p className="text-xl mb-2" style={TITLE}>
            No clicks yet
          </p>
          <p className="text-sm" style={{ color: C.muted }}>
            Once you share a /go/ link and someone clicks it, it appears here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {clicks.map((click) => (
            <ClickRow key={String(click.id)} click={click} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The four states, with the headline first.
 *
 * Magnitude is the number itself. No bar, no colour scale: these are four
 * states of one total, not a ranking, and a coloured rail behind them would
 * encode nothing while looking like it encoded something.
 */
function CountsBar({
  counts,
}: {
  counts: { human: number; uncertain: number; crawler: number; test: number; total: number };
}) {
  const cells: { label: string; value: number; hint: string; strong?: boolean }[] = [
    {
      label: 'People',
      value: counts.human,
      hint: 'The only figure any other page counts.',
      strong: true,
    },
    { label: 'Uncertain', value: counts.uncertain, hint: CLASSIFICATION_REASON.uncertain },
    { label: 'Crawler', value: counts.crawler, hint: CLASSIFICATION_REASON.crawler },
    { label: 'Your tests', value: counts.test, hint: 'Marked by you. Visible here, counted nowhere.' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {cells.map((cell) => (
        <div key={cell.label} style={{ ...CARD, padding: '0.875rem 1rem' }} title={cell.hint}>
          <p style={EYEBROW}>{cell.label}</p>
          <p
            className="tabular-nums mt-1"
            style={{
              fontSize: cell.strong ? '1.75rem' : '1.375rem',
              fontWeight: 600,
              color: cell.strong ? C.text : C.muted,
              letterSpacing: '-0.021em',
            }}
          >
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * When the rules last changed, and whether history agrees with them.
 *
 * Migration 005 rewrote the 16 Sept totals on 19 Sept with nothing on screen
 * to say so. This is the fix: the date the rules last moved sits next to the
 * figures they produced.
 */
function RulesNotice({
  rules,
  stale,
}: {
  rules: { version: number; changedOn: string; note: string } | null;
  stale: number;
}) {
  return (
    <div style={{ ...CARD, padding: '0.875rem 1rem' }} className="mb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p style={EYEBROW}>Classification rules</p>
          <p className="text-sm mt-1" style={{ color: C.text }}>
            {rules
              ? `Version ${rules.version}, last changed ${shortDate(rules.changedOn)}.`
              : 'No rules version recorded. Run migration 008.'}{' '}
            {stale > 0 ? (
              <span style={{ color: severityBad.color }}>
                {stale} {stale === 1 ? 'click was' : 'clicks were'} judged by an older version.
                Reclassify so every figure comes from the same rules.
              </span>
            ) : (
              <span style={{ color: C.muted }}>Every click was judged by this version.</span>
            )}
          </p>
          {rules && (
            <p className="text-xs mt-1.5" style={{ color: C.muted }}>
              {rules.note}
            </p>
          )}
        </div>
        <ReclassifyButton stale={stale} />
      </div>
    </div>
  );
}

/** Clicks that could not be recorded. Never hidden, never summarised away. */
function FailureNotice({
  failures,
}: {
  failures: { id: string; failedAt: string; slug: string | null; path: string | null; reason: string; detail: string | null }[];
}) {
  return (
    <div
      style={{
        ...CARD,
        padding: '0.875rem 1rem',
        border: severityBad.border,
        background: severityBad.background,
      }}
      className="mb-4"
    >
      <p className="text-sm font-semibold" style={{ color: severityBad.color }}>
        {failures.length} recorded {failures.length === 1 ? 'failure' : 'failures'} on the /go/ route
      </p>
      <p className="text-xs mt-1 mb-2" style={{ color: severityBad.color }}>
        These hits reached the redirect but were not counted. Showing the most recent.
      </p>
      <div className="space-y-1">
        {failures.map((f) => (
          <div key={f.id} className="text-xs tabular-nums" style={{ color: severityBad.color }}>
            {shortDateTime(f.failedAt)} · <code>{f.path ?? `/go/${f.slug ?? ''}`}</code> ·{' '}
            {f.reason}
            {f.detail ? ` · ${f.detail}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClickRow({ click }: { click: Record<string, unknown> }) {
  const id = String(click.id);
  const slug = click.slug as string;
  const platform = click.platform as string | null;
  const format = click.format as string | null;
  const ctaType = click.cta_type as string | null;
  const country = click.country as string | null;
  const referrer = click.referrer as string | null;
  const userAgent = click.user_agent as string | null;
  const sessionId = click.session_id as string | null;
  const sessionHits = (click.session_hits as number) ?? 1;
  const classification = (click.classification as Classification) ?? 'uncertain';
  const isTest = click.is_test === true;
  const clickedAt = new Date(click.clicked_at as string);

  const shortReferrer = (() => {
    if (!referrer) return null;
    try {
      return new URL(referrer).hostname;
    } catch {
      return referrer.slice(0, 40);
    }
  })();

  return (
    <div style={{ ...CARD, padding: '0.75rem 1rem' }}>
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <div
          aria-hidden
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: platform ? platformColor(platform) : C.border }}
        />

        <code className="flex-shrink-0" style={{ color: C.text }}>
          /go/{slug}
        </code>

        <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
          {/* The state always travels as a word. */}
          <StateTag classification={classification} isTest={isTest} />
          {format && <SmallTag>{format}</SmallTag>}
          {ctaType && <SmallTag>{ctaType}</SmallTag>}
        </div>

        {country && (
          <span className="flex-shrink-0 text-xs" style={{ color: C.muted }}>
            {country}
          </span>
        )}

        {shortReferrer && (
          <span className="min-w-0 truncate text-xs" style={{ color: C.muted }}>
            {shortReferrer}
          </span>
        )}

        <span className="flex-1" />

        <span className="flex-shrink-0 text-xs tabular-nums" style={{ color: C.muted }}>
          {shortDateTime(clickedAt)}
        </span>

        <TestToggle id={id} isTest={isTest} />
      </div>

      {/* The evidence the classification was made from, in full. */}
      <div className="mt-2 flex items-start gap-3 flex-wrap">
        <p
          className="text-xs font-mono min-w-0 break-all flex-1"
          style={{ color: C.muted }}
          title="The stored user agent. Classification is recomputed from this string, never from timing."
        >
          {userAgent ?? '(no user agent sent)'}
        </p>
        {sessionId && sessionHits > 1 && (
          <SessionToggle sessionId={sessionId} isTest={isTest} count={sessionHits} />
        )}
      </div>
    </div>
  );
}

/**
 * Classification as a word in a neutral chip.
 *
 * No hue is assigned to a state here on purpose. Colour in this project does
 * status or identity and nothing else, and these four are neither: they are
 * four buckets of one total. A fifth colour scale invented for them would
 * collide with the status scale on the same screen.
 */
function StateTag({ classification, isTest }: { classification: Classification; isTest: boolean }) {
  if (isTest) {
    return (
      <span
        className="text-xs px-1.5 py-0.5"
        style={{
          background: C.neutral,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: RADIUS.sm,
          fontWeight: 500,
        }}
        title="Your own test click. It stays in the log and is counted nowhere."
      >
        Your test
      </span>
    );
  }

  const counted = classification === 'human';

  return (
    <span
      className="text-xs px-1.5 py-0.5"
      style={{
        background: C.neutral,
        color: counted ? C.text : C.muted,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS.sm,
        fontWeight: counted ? 500 : 400,
      }}
      title={CLASSIFICATION_REASON[classification]}
    >
      {CLASSIFICATION_LABEL[classification]}
      {counted ? '' : ', not counted'}
    </span>
  );
}

function SmallTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5"
      style={{ background: C.neutral, color: C.muted, borderRadius: RADIUS.sm }}
    >
      {children}
    </span>
  );
}
