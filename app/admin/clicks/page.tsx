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
      l.platform,
      l.format,
      l.cta_type
    FROM click_events ce
    LEFT JOIN links l ON ce.slug = l.slug
    ORDER BY ce.clicked_at DESC
    LIMIT 200
  `;

  const total = await sql`SELECT COUNT(*)::int AS n FROM click_events`;
  const totalCount = total[0]?.n ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#FBF6E3' }}
          >
            Click Log
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#8A7A60' }}>
            {totalCount} total clicks. Showing the most recent 200.
          </p>
        </div>
      </div>

      {clicks.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{ background: '#1A1008', border: '1px dashed #3A2210' }}
        >
          <p className="text-xl mb-2" style={{ color: '#FBF6E3', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            No clicks yet
          </p>
          <p className="text-sm" style={{ color: '#8A7A60' }}>
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
      style={{ background: '#1A1008', border: '1px solid #3A2210' }}
    >
      {/* Platform dot */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: platform ? (PLATFORM_COLOR[platform] ?? '#8A7A60') : '#3A2210' }}
      />

      {/* Slug */}
      <code className="flex-shrink-0" style={{ color: '#E8C84A' }}>
        /go/{slug}
      </code>

      {/* Tags */}
      <div className="flex gap-1.5 flex-shrink-0">
        {format && <SmallTag>{format}</SmallTag>}
        {ctaType && <SmallTag>{ctaType}</SmallTag>}
      </div>

      {/* Country */}
      {country && (
        <span className="flex-shrink-0 text-xs" style={{ color: '#8A7A60' }}>
          {country}
        </span>
      )}

      {/* Referrer */}
      {shortReferrer && (
        <span className="flex-1 min-w-0 truncate text-xs" style={{ color: '#5A4A30' }}>
          {shortReferrer}
        </span>
      )}

      {/* Time */}
      <span className="flex-shrink-0 text-xs tabular-nums" style={{ color: '#5A4A30' }}>
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
      style={{ background: '#3A2210', color: '#8A7A60' }}
    >
      {children}
    </span>
  );
}
