import Link from 'next/link';
import {
  getPostsForTagging,
  getKnownThemes,
  getPostTagCounts,
  type PostFilter,
} from '@/lib/queries';
import { ThemePicker } from './ThemePicker';
import { PostThumb } from '@/components/PostThumb';
import { pillarLabel } from '@/lib/pillars';
import { C, RADIUS, TITLE, compact, shortDate, platformLabel, formatLabel } from '@/lib/theme';

export const dynamic = 'force-dynamic';

const FILTERS: { value: PostFilter; label: string }[] = [
  { value: 'untagged', label: 'Untagged' },
  { value: 'tagged', label: 'Tagged' },
  { value: 'all', label: 'All' },
];

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const raw = params.filter;
  // Untagged is the default, because that is the pile that needs work.
  const filter: PostFilter =
    raw === 'all' || raw === 'tagged' || raw === 'untagged' ? raw : 'untagged';

  const [posts, knownThemes, counts] = await Promise.all([
    getPostsForTagging(filter),
    getKnownThemes(),
    getPostTagCounts(),
  ]);

  const countFor = (f: PostFilter) =>
    f === 'all' ? counts.all : f === 'tagged' ? counts.tagged : counts.untagged;

  return (
    <div>
      <div className="mb-5">
        <h1 className="mb-1" style={{ ...TITLE, fontSize: '1.6rem' }}>
          Posts
        </h1>
        <p className="text-sm" style={{ color: C.muted, maxWidth: '70ch' }}>
          {counts.tagged} of {counts.all} tagged. Tagging a post is what connects what you published
          to what people viewed and clicked. One click, then Save.
        </p>
      </div>

      <div className="flex items-center gap-1 mb-4">
        {FILTERS.map((f) => {
          const active = f.value === filter;
          return (
            <Link
              key={f.value}
              href={`/admin/posts?filter=${f.value}`}
              className="text-sm px-3 py-1.5"
              style={{
                borderRadius: RADIUS.sm,
                textDecoration: 'none',
                background: active ? C.text : 'transparent',
                color: active ? C.page : C.muted,
                fontWeight: active ? 600 : 400,
                border: `1px solid ${active ? C.text : C.border}`,
              }}
            >
              {f.label}
              <span style={{ opacity: 0.7 }}> {countFor(f.value)}</span>
            </Link>
          );
        })}
      </div>

      {posts.length === 0 ? (
        <div
          className="text-center py-16"
          style={{ background: C.neutral, border: `1px dashed ${C.border}`, borderRadius: RADIUS.md }}
        >
          <p className="text-xl mb-2" style={{ fontWeight: 600, color: C.text }}>
            {filter === 'untagged' ? 'Everything is tagged' : 'Nothing here'}
          </p>
          <p className="text-sm" style={{ color: C.muted }}>
            {filter === 'untagged'
              ? 'Every synced post carries a tag. The Themes and Growth views are working from a complete set.'
              : 'Run the Meta sync and your Facebook and Instagram posts appear here.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {posts.map((p) => {
            const caption = ((p.caption as string) ?? '').replace(/\s+/g, ' ').trim();
            const permalink = p.permalink as string | null;
            const theme = p.content_theme as string | null;
            return (
              <div
                key={p.id as number}
                className="flex items-start gap-3 px-3 py-3"
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: RADIUS.md,
                }}
              >
                <PostThumb src={p.thumbnail_url as string | null} label={formatLabel(p.format as string)} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate mb-1" style={{ color: C.text }}>
                    {permalink ? (
                      <a
                        href={permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: C.text, textDecoration: 'none' }}
                      >
                        {caption || 'Untitled post'}
                      </a>
                    ) : (
                      caption || 'Untitled post'
                    )}
                  </p>
                  <p className="text-xs" style={{ color: C.muted }}>
                    {platformLabel(p.platform as string)} · {formatLabel(p.format as string)} ·{' '}
                    {shortDate(p.published_at as string)} · {compact(p.views as number)} views ·{' '}
                    {compact(p.engagement as number)} engagement
                    {theme && (
                      <>
                        {' · '}
                        <span style={{ color: C.text, fontWeight: 600 }}>{pillarLabel(theme)}</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex-shrink-0">
                  <ThemePicker
                    postId={p.id as number}
                    current={theme}
                    knownThemes={knownThemes}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
