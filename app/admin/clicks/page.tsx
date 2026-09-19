import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PLATFORM_COLOR: Record<string, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  tiktok: '#69C9D0',
  youtube: '#FF0000',
};

export default async function ClicksPage() {
  const clicks = await sql`
    SELECT
      ce.id,
      ce.slug,
      ce.clicked_at,
      ce.referrer,
      ce.country,
      ce.is_bot,
      l.platform,
      l.format,
      l.cta_type
    FROM click_events ce
    LEFT JOIN links l ON ce.slug = l.slug
    ORDER BY ce.clicked_at DESC
    LIMIT 200
  `;

  // This is the raw log, so it reads click_events and shows crawlers, marked.
  // Every figure elsewhere reads human_clicks.
  const total = await sql`
    SELECT COUNT(*) FILTER (WHERE NOT is_bot)::int AS humans,
           COUNT(*) FILTER (WHERE is_bot)::int     AS bots
    FROM click_events
  `;
  const humanCount = (total[0]?.humans as number) ?? 0;
  const botCount = (total[0]?.bots as number) ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl" style={{ fontWeight: 600, color: '#111111' }}>
            Click Log
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#555555' }}>
            {humanCount} clicks from people, {botCount} crawler hits that are logged but never
            counted. Showing the most recent 200 of both.
          </p>
        </div>
      </div>

      {clicks.length === 0 ? (
        <div
          className="text-center py-16 rounded-lg"
          style={{ background: '#F2F2F2', border: '1px dashed #D0D0D0' }}
        >
          <p className="text-xl mb-2" style={{ fontWeight: 600, color: '#111111' }}>
            No clicks yet
          </p>
          <p className="text-sm" style={{ color: '#555555' }}>
            Once you share a /go/ link and someone clicks it, it appears here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {clicks.map((click) => (
            <ClickRow key={click.id as string} click={click} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClickRow({ click }: { click: Record<string, unknown> }) {
  const slug = click.slug as string;
  const platform = click.platform as string | null;
  const format = click.format as string | null;
  const ctaType = click.cta_type as string | null;
  const country = click.country as string | null;
  const referrer = click.referrer as string | null;
  const isBot = click.is_bot === true;
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
    <div
      className="rounded-lg px-4 py-3 flex items-center gap-3 text-sm"
      style={{ background: '#FFFFFF', border: '1px solid #D0D0D0' }}
    >
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: platform ? (PLATFORM_COLOR[platform] ?? '#555555') : '#D0D0D0' }}
      />

      <code className="flex-shrink-0" style={{ color: '#111111' }}>
        /go/{slug}
      </code>

      <div className="flex gap-1.5 flex-shrink-0">
        {format && <SmallTag>{format}</SmallTag>}
        {ctaType && <SmallTag>{ctaType}</SmallTag>}
        {isBot && <SmallTag>crawler, not counted</SmallTag>}
      </div>

      {country && (
        <span className="flex-shrink-0 text-xs" style={{ color: '#555555' }}>
          {country}
        </span>
      )}

      {shortReferrer && (
        <span className="flex-1 min-w-0 truncate text-xs" style={{ color: '#555555' }}>
          {shortReferrer}
        </span>
      )}

      <span className="flex-shrink-0 text-xs tabular-nums" style={{ color: '#555555' }}>
        {clickedAt.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      </span>
    </div>
  );
}

function SmallTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded"
      style={{ background: '#F2F2F2', color: '#555555' }}
    >
      {children}
    </span>
  );
}
