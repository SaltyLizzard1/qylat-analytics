import { getLeaderboard } from '@/lib/queries';
import { Panel, Empty, Note, PageHeader } from '@/components/charts';
import { StatusBadge, StatusLegend } from '@/components/status';
import { engagementStatus } from '@/lib/status';
import { C, compact, pct, shortDate, platformLabel, formatLabel } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const rows = await getLeaderboard(30);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Post Leaderboard"
        lead="Every synced post ranked by views, with engagement rate beside it so a small post that punched above its weight is still visible."
      />

      <StatusLegend />

      <Panel title={`Top ${Math.min(rows.length, 30)} posts`}>
        {rows.length === 0 ? (
          <Empty message="No posts synced yet. Run the Meta sync first." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <Th align="left">Post</Th>
                  <Th align="left">Where</Th>
                  <Th align="right">Views</Th>
                  <Th align="right">Eng.</Th>
                  <Th align="right">Eng. rate</Th>
                  <Th align="right">Published</Th>
                  <Th align="left">Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const caption = ((r.caption as string) ?? '').replace(/\s+/g, ' ').trim();
                  const permalink = r.permalink as string | null;
                  const views = r.views as number | null;
                  const engagement = r.engagement as number | null;
                  return (
                    <tr
                      key={r.id as number}
                      style={{
                        borderBottom: `1px solid ${C.border}`,
                        background: i % 2 === 1 ? C.neutral : C.card,
                      }}
                    >
                      <Td>
                        <span className="block max-w-md truncate" style={{ color: C.text }}>
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
                        </span>
                      </Td>
                      <Td>
                        <span className="text-xs" style={{ color: C.muted }}>
                          {platformLabel(r.platform as string)} / {formatLabel(r.format as string)}
                        </span>
                      </Td>
                      <Td align="right" bold>
                        {compact(views)}
                      </Td>
                      <Td align="right">{compact(engagement)}</Td>
                      <Td align="right">{pct(engagement, views)}</Td>
                      <Td align="right">
                        <span className="text-xs" style={{ color: C.muted }}>
                          {shortDate(r.published_at as string)}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={engagementStatus(engagement, views)} compact />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Note>
          Ranked on views rather than reach, because Meta returns zero reach for every Facebook Page
          post. Engagement rate is engagement divided by views.
        </Note>
      </Panel>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className="text-xs uppercase tracking-widest font-normal px-2 py-2"
      style={{ color: C.muted, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  bold = false,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  bold?: boolean;
}) {
  return (
    <td
      className="px-2 py-2.5 tabular-nums"
      style={{ textAlign: align, color: C.text, fontWeight: bold ? 600 : 400 }}
    >
      {children}
    </td>
  );
}
