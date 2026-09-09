import { getPostsForTagging, getKnownThemes } from '@/lib/queries';
import { ThemePicker } from './ThemePicker';
import { C, compact, shortDate, platformLabel, formatLabel } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function PostsPage() {
  const [posts, knownThemes] = await Promise.all([getPostsForTagging(), getKnownThemes()]);

  const untagged = posts.filter((p) => !p.content_theme).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl mb-1" style={{ fontWeight: 600, color: C.text }}>
          Posts
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          {posts.length} synced from Facebook and Instagram. {untagged} still need a theme.
        </p>
        <p className="text-sm mt-2" style={{ color: C.muted }}>
          Tagging a post with the same theme you put on a /go/ link is what connects what you
          published to what people clicked. Type a new theme or pick an existing one, then Save.
        </p>
      </div>

      {posts.length === 0 ? (
        <div
          className="text-center py-16 rounded-lg"
          style={{ background: C.neutral, border: `1px dashed ${C.border}` }}
        >
          <p className="text-xl mb-2" style={{ fontWeight: 600, color: C.text }}>
            No posts yet
          </p>
          <p className="text-sm" style={{ color: C.muted }}>
            Run the Meta sync and your Facebook and Instagram posts appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((p) => {
            const caption = ((p.caption as string) ?? '').replace(/\s+/g, ' ').trim();
            const permalink = p.permalink as string | null;
            return (
              <div
                key={p.id as number}
                className="rounded-lg p-3.5"
                style={{ background: C.card, border: `1px solid ${C.border}` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0" style={{ minWidth: '14rem' }}>
                    <p className="text-sm truncate mb-1" style={{ color: C.text }}>
                      {permalink ? (
                        <a
                          href={permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: C.text, textDecoration: 'underline' }}
                        >
                          {caption || 'Untitled post'}
                        </a>
                      ) : (
                        caption || 'Untitled post'
                      )}
                    </p>
                    <p className="text-xs" style={{ color: C.muted }}>
                      {platformLabel(p.platform as string)} / {formatLabel(p.format as string)} ·{' '}
                      {shortDate(p.published_at as string)} · {compact(p.views as number)} views ·{' '}
                      {compact(p.engagement as number)} engagement
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    <ThemePicker
                      postId={p.id as number}
                      current={(p.content_theme as string) ?? null}
                      knownThemes={knownThemes}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
