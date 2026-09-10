import { sql } from '@/lib/db';
import {
  arrivalStatus,
  engagementStatus,
  formatStatus,
  idleLinkStatus,
  taggingStatus,
  LEVEL_RANK,
  type Level,
} from '@/lib/status';

/**
 * The attention list on the overview.
 *
 * One place that asks every part of the dashboard "is anything wrong", so the
 * first screen answers what to work on rather than leaving it to be found by
 * clicking through seven tabs. Sorted worst first.
 *
 * Nothing here invents a finding. Every check refuses to report below the
 * minimum sample in lib/status.ts, so a quiet week reads as quiet rather than
 * as a crisis.
 */

export type AttentionItem = {
  level: Level;
  title: string;
  detail: string;
  href: string;
  action: string;
};

export async function getAttentionItems(): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];

  // Funnel: arrival rate per platform.
  const funnel = await sql(`
    WITH clicks AS (
      SELECT l.platform, COUNT(c.id)::int AS clicks
      FROM links l LEFT JOIN click_events c ON c.slug = l.slug
      GROUP BY l.platform
    ),
    ga AS (
      SELECT l.platform, SUM(s.sessions)::int AS sessions
      FROM site_sessions s JOIN links l ON l.slug = s.content
      GROUP BY l.platform
    )
    SELECT c.platform, c.clicks, COALESCE(g.sessions, 0) AS sessions
    FROM clicks c LEFT JOIN ga g ON g.platform = c.platform
  `);

  for (const row of funnel) {
    const status = arrivalStatus(row.sessions as number, row.clicks as number);
    if (status && status.level !== 'good') {
      items.push({
        level: status.level,
        title: `${row.platform} traffic is not arriving`,
        detail: status.reason,
        href: '/dashboard/funnel',
        action: 'Check where the link points and whether the page loads in the in-app browser',
      });
    }
  }

  // Engagement per platform.
  const engagement = await sql(`
    WITH latest AS (
      SELECT DISTINCT ON (post_id) post_id, views, engagement
      FROM post_metrics ORDER BY post_id, recorded_on DESC
    )
    SELECT p.platform, SUM(l.views)::int AS views, SUM(l.engagement)::int AS engagement
    FROM posts p JOIN latest l ON l.post_id = p.id
    GROUP BY p.platform
  `);

  for (const row of engagement) {
    const status = engagementStatus(row.engagement as number, row.views as number);
    if (status && status.level !== 'good') {
      items.push({
        level: status.level,
        title: `${row.platform} engagement is low`,
        detail: status.reason,
        href: '/dashboard/platforms',
        action: 'Views are landing but nobody is reacting. Look at what the posts ask people to do',
      });
    }
  }

  // Formats performing below their platform average.
  const formats = await sql(`
    WITH latest AS (
      SELECT DISTINCT ON (post_id) post_id, views
      FROM post_metrics ORDER BY post_id, recorded_on DESC
    ),
    per_format AS (
      SELECT p.platform, p.format, COUNT(*)::int AS posts, AVG(l.views) AS avg_views
      FROM posts p JOIN latest l ON l.post_id = p.id
      GROUP BY p.platform, p.format
    ),
    per_platform AS (
      SELECT p.platform, AVG(l.views) AS avg_views
      FROM posts p JOIN latest l ON l.post_id = p.id
      GROUP BY p.platform
    )
    SELECT f.platform, f.format, f.posts, f.avg_views, pp.avg_views AS platform_avg
    FROM per_format f JOIN per_platform pp ON pp.platform = f.platform
  `);

  for (const row of formats) {
    const status = formatStatus(
      Number(row.avg_views),
      Number(row.platform_avg),
      row.posts as number
    );
    if (status && status.level === 'bad') {
      items.push({
        level: status.level,
        title: `${row.platform} ${row.format} underperforms`,
        detail: status.reason,
        href: '/dashboard/formats',
        action: 'Consider posting less of this format and more of what is working',
      });
    }
  }

  // Links created but never clicked.
  const idle = await sql(`
    SELECT l.slug, l.created_at, COUNT(c.id)::int AS clicks
    FROM links l LEFT JOIN click_events c ON c.slug = l.slug
    GROUP BY l.slug, l.created_at
  `);

  const idleFlagged = idle
    .map((row) => ({ row, status: idleLinkStatus(row.clicks as number, row.created_at as string) }))
    .filter((x) => x.status !== null);

  if (idleFlagged.length > 0) {
    const worst = idleFlagged.reduce((a, b) =>
      LEVEL_RANK[a.status!.level] <= LEVEL_RANK[b.status!.level] ? a : b
    );
    items.push({
      level: worst.status!.level,
      title: `${idleFlagged.length} link${idleFlagged.length === 1 ? '' : 's'} with no clicks`,
      detail: `Longest idle: ${worst.row.slug}, ${worst.status!.reason}`,
      href: '/admin/links',
      action: 'Either use them in a post or delete them so the numbers are not diluted',
    });
  }

  // Untagged posts, which keep the theme views empty.
  const tagging = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE content_theme IS NULL OR content_theme = '')::int AS untagged
    FROM posts
  `;
  const tagStatus = taggingStatus(
    (tagging[0]?.untagged as number) ?? 0,
    (tagging[0]?.total as number) ?? 0
  );
  if (tagStatus && tagStatus.level !== 'good') {
    items.push({
      level: tagStatus.level,
      title: 'Posts have no content theme',
      detail: tagStatus.reason,
      href: '/admin/posts',
      action: 'Tag posts to connect what you published to what people clicked',
    });
  }

  return items.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}
