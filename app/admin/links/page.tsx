import Link from 'next/link';
import { sql } from '@/lib/db';
import { CopyButton } from '@/components/CopyButton';

export const dynamic = 'force-dynamic';

const PLATFORM_COLOR: Record<string, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  tiktok: '#69C9D0',
  youtube: '#FF0000',
};

export default async function LinksPage() {
  const links = await sql`
    SELECT
      l.slug,
      l.platform,
      l.format,
      l.content_theme,
      l.cta_type,
      l.created_at,
      COUNT(ce.id)::int AS click_count
    FROM links l
    LEFT JOIN click_events ce ON l.slug = ce.slug
    GROUP BY l.slug, l.platform, l.format, l.content_theme, l.cta_type, l.created_at
    ORDER BY l.created_at DESC
  `;

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#FBF6E3' }}
        >
          Short Links
        </h1>
        <Link
          href="/admin/links/new"
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            background: 'linear-gradient(135deg, #8B6914, #E8C84A)',
            color: '#2D1A00',
            border: '1.5px solid #2D1A00',
          }}
        >
          + New Link
        </Link>
      </div>

      {links.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <LinkCard key={link.slug} link={link} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="text-center py-16 rounded-xl"
      style={{ background: '#1A1008', border: '1px dashed #3A2210' }}
    >
      <p
        className="text-xl mb-2"
        style={{ color: '#FBF6E3', fontFamily: "'Cormorant Garamond', Georgia, serif" }}
      >
        No links yet
      </p>
      <p className="text-sm mb-6 max-w-xs mx-auto" style={{ color: '#8A7A60' }}>
        Create a link before your next post. Every click on that link will be logged here with platform, country, and referrer.
      </p>
      <Link
        href="/admin/links/new"
        className="px-5 py-2.5 rounded-lg text-sm font-semibold"
        style={{
          background: 'linear-gradient(135deg, #8B6914, #E8C84A)',
          color: '#2D1A00',
          border: '1.5px solid #2D1A00',
        }}
      >
        Create your first link
      </Link>
    </div>
  );
}

function LinkCard({ link }: { link: Record<string, unknown> }) {
  const slug = link.slug as string;
  const platform = link.platform as string;
  const format = link.format as string | null;
  const contentTheme = link.content_theme as string | null;
  const ctaType = link.cta_type as string | null;
  const clickCount = link.click_count as number;
  const createdAt = new Date(link.created_at as string);

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#1A1008', border: '1px solid #3A2210' }}
    >
      <div className="flex items-start gap-3">
        {/* Platform dot */}
        <div
          className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
          style={{ background: PLATFORM_COLOR[platform] ?? '#8A7A60' }}
        />

        <div className="flex-1 min-w-0">
          {/* Slug + copy */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <code className="text-sm font-mono" style={{ color: '#E8C84A' }}>
              /go/{slug}
            </code>
            <CopyButton text={`/go/${slug}`} label="Copy slug" />
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            <Tag>{platform}</Tag>
            {format && <Tag>{format}</Tag>}
            {ctaType && <Tag>{ctaType}</Tag>}
            {contentTheme && <Tag>{contentTheme}</Tag>}
          </div>

          {/* Meta */}
          <p className="text-xs" style={{ color: '#5A4A30' }}>
            Created {createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Click count */}
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold" style={{ color: '#FBF6E3' }}>
            {clickCount}
          </p>
          <p className="text-xs" style={{ color: '#8A7A60' }}>clicks</p>
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={{ background: '#3A2210', color: '#8A7A60' }}
    >
      {children}
    </span>
  );
}
