import Link from 'next/link';
import { sql } from '@/lib/db';
import { CopyButton } from '@/components/CopyButton';
import { BASE_URL } from '@/lib/config';
import { C, CARD, RADIUS, TITLE, EYEBROW, shortDate, platformColor } from '@/lib/theme';
import { getClickCountsBySlug, getRulesVersion, type ClickCounts } from '@/lib/clicks';
import { DeleteLinkButton } from './DeleteLinkButton';

export const dynamic = 'force-dynamic';

const ZERO: ClickCounts = { human: 0, uncertain: 0, crawler: 0, test: 0, total: 0 };

/**
 * Short links, each with the four states of its clicks.
 *
 * The headline number is people only, and it is the same number the dashboard
 * counts, because both read the human_clicks view. The other three are shown
 * beside it rather than hidden, so a link with 9 people and 28 crawlers never
 * again looks like a link with 37 clicks.
 */
export default async function LinksPage() {
  const [links, counts, rules] = await Promise.all([
    sql`
      SELECT slug, platform, format, content_theme, cta_type, created_at
      FROM links
      ORDER BY created_at DESC
    `,
    getClickCountsBySlug(),
    getRulesVersion(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
        <h1 className="text-2xl" style={TITLE}>
          Short Links
        </h1>
        <Link
          href="/admin/links/new"
          className="px-4 py-2 text-sm font-semibold"
          style={{
            background: C.text,
            color: C.card,
            border: `1px solid ${C.text}`,
            borderRadius: RADIUS.md,
            textDecoration: 'none',
          }}
        >
          + New Link
        </Link>
      </div>

      {/*
        The same sentence appears on the Click Log. If a figure here ever
        disagrees with one there, the rules version is the first thing to check.
      */}
      <p className="text-sm mb-6" style={{ color: C.muted }}>
        Clicks are counted as people only.{' '}
        {rules
          ? `Classification rules version ${rules.version}, last changed ${shortDate(rules.changedOn)}.`
          : 'No classification rules version recorded. Run migration 008.'}{' '}
        <Link href="/admin/clicks" style={{ color: C.text }}>
          See the full log
        </Link>
        .
      </p>

      {links.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <LinkCard
              key={link.slug as string}
              link={link}
              counts={counts.get(link.slug as string) ?? ZERO}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="text-center py-16"
      style={{ background: C.neutral, border: `1px dashed ${C.border}`, borderRadius: RADIUS.md }}
    >
      <p className="text-xl mb-2" style={TITLE}>
        No links yet
      </p>
      <p className="text-sm mb-6 max-w-xs mx-auto" style={{ color: C.muted }}>
        Create a link before your next post. Every click on that link will be logged here with
        platform, country, and referrer.
      </p>
      <Link
        href="/admin/links/new"
        className="px-5 py-2.5 text-sm font-semibold"
        style={{
          background: C.text,
          color: C.card,
          border: `1px solid ${C.text}`,
          borderRadius: RADIUS.md,
          textDecoration: 'none',
        }}
      >
        Create your first link
      </Link>
    </div>
  );
}

function LinkCard({ link, counts }: { link: Record<string, unknown>; counts: ClickCounts }) {
  const slug = link.slug as string;
  const platform = link.platform as string;
  const format = link.format as string | null;
  const contentTheme = link.content_theme as string | null;
  const ctaType = link.cta_type as string | null;

  return (
    <div style={{ ...CARD, padding: '1rem' }}>
      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
        <div
          aria-hidden
          className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
          style={{ background: platformColor(platform) }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <code className="text-sm font-mono break-all" style={{ color: C.text }}>
              {BASE_URL}/{slug}
            </code>
            <CopyButton text={`${BASE_URL}/${slug}`} label="Copy" />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2">
            <Tag>{platform}</Tag>
            {format && <Tag>{format}</Tag>}
            {ctaType && <Tag>{ctaType}</Tag>}
            {contentTheme && <Tag>{contentTheme}</Tag>}
          </div>

          <p className="text-xs" style={{ color: C.muted }}>
            {/*
              shortDate, not toLocaleDateString. The server renders in UTC and
              the reader is in Chiang Mai, so a bare locale call dates a link
              created at 05:30 on the 15th as the 14th.
            */}
            Created {shortDate(link.created_at as string)}
          </p>
        </div>

        <div className="flex-shrink-0 flex items-start gap-4">
          <ClickBreakdown counts={counts} />
          <div className="pt-1">
            <DeleteLinkButton slug={slug} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * People first and large, the rest small beside it.
 *
 * The four are mutually exclusive and sum to the total, which is stated, so
 * the arithmetic is checkable without leaving the page.
 */
function ClickBreakdown({ counts }: { counts: ClickCounts }) {
  const rest: { label: string; value: number; hint: string }[] = [
    {
      label: 'uncertain',
      value: counts.uncertain,
      hint: 'An ordinary browser arriving from a Meta domain. Could be a person, could be one of Meta’s fetchers.',
    },
    { label: 'crawler', value: counts.crawler, hint: 'Link preview fetchers and other self declared bots.' },
    { label: 'your tests', value: counts.test, hint: 'Clicks you marked as your own. Never counted.' },
  ];

  return (
    <div className="text-right">
      <p
        className="tabular-nums"
        style={{ fontSize: '1.75rem', fontWeight: 600, color: C.text, letterSpacing: '-0.021em' }}
      >
        {counts.human}
      </p>
      <p style={{ ...EYEBROW, textAlign: 'right' }}>
        {counts.human === 1 ? 'person' : 'people'}
      </p>

      <div className="mt-2 space-y-0.5">
        {rest.map((r) => (
          <p key={r.label} className="text-xs tabular-nums" style={{ color: C.muted }} title={r.hint}>
            {r.value} {r.label}
          </p>
        ))}
        <p
          className="text-xs tabular-nums pt-0.5"
          style={{ color: C.muted, borderTop: `1px solid ${C.border}` }}
          title="Every hit ever recorded on this link. The four states above sum to this."
        >
          {counts.total} logged
        </p>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-2 py-0.5"
      style={{ background: C.neutral, color: C.muted, borderRadius: RADIUS.pill }}
    >
      {children}
    </span>
  );
}
