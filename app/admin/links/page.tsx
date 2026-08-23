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
        <h1 className="text-2xl" style={{ fontWeight: 600, color: '#111111' }}>
          Short Links
        </h1>
        <Link
          href="/admin/links/new"
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            background: '#111111',
            color: '#FFFFFF',
            border: '1px solid #111111',
            textDecoration: 'none',
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
      className="text-center py-16 rounded-lg"
      style={{ background: '#F2F2F2', border: '1px dashed #D0D0D0' }}
    >
      <p className="text-xl mb-2" style={{ fontWeight: 600, color: '#111111' }}>
        No links yet
      </p>
      <p className="text-sm mb-6 max-w-xs mx-auto" style={{ color: '#555555' }}>
        Create a link before your next post. Every click on that link will be logged here with platform, country, and referrer.
      </p>
      <Link
        href="/admin/links/new"
        className="px-5 py-2.5 rounded-lg text-sm font-semibold"
        style={{
          background: '#111111',
          color: '#FFFFFF',
          border: '1px solid #111111',
          textDecoration: 'none',
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
      className="rounded-lg p-4"
      style={{ background: '#FFFFFF', border: '1px solid #D0D0D0' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
          style={{ background: PLATFORM_COLOR[platform] ?? '#555555' }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <code className="text-sm font-mono" style={{ color: '#111111' }}>
              /go/{slug}
            </code>
            <CopyButton text={`/go/${slug}`} label="Copy slug" />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2">
            <Tag>{platform}</Tag>
            {format && <Tag>{format}</Tag>}
            {ctaType && <Tag>{ctaType}</Tag>}
            {contentTheme && <Tag>{contentTheme}</Tag>}
          </div>

          <p className="text-xs" style={{ color: '#555555' }}>
            Created {createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold" style={{ color: '#111111' }}>
            {clickCount}
          </p>
          <p className="text-xs" style={{ color: '#555555' }}>clicks</p>
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={{ background: '#F2F2F2', color: '#555555' }}
    >
      {children}
    </span>
  );
}
