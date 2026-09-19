import { sql } from '@/lib/db';
import {
  arrivalStatus,
  engagementStatus,
  formatStatus,
  idleLinkStatus,
  pageUpdateStatus,
  taggingStatus,
  LEVEL_RANK,
  THRESHOLDS,
  type Level,
} from '@/lib/status';
import { getFormatBenchmarkAtAge } from '@/lib/cohort';
import { getPageUpdates } from '@/lib/queries';
import { platformLabel, formatLabel } from '@/lib/theme';

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
      FROM links l LEFT JOIN human_clicks c ON c.slug = l.slug
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
        title: `${platformLabel(row.platform as string)} traffic is not arriving`,
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
    FROM content_posts p JOIN latest l ON l.post_id = p.id
    GROUP BY p.platform
  `);

  for (const row of engagement) {
    const status = engagementStatus(row.engagement as number, row.views as number);
    if (status && status.level !== 'good') {
      items.push({
        level: status.level,
        title: `${platformLabel(row.platform as string)} engagement is low`,
        detail: status.reason,
        href: '/dashboard/platforms',
        action: 'Views are landing but nobody is reacting. Look at what the posts ask people to do',
      });
    }
  }

  // Formats below their platform median, measured at the same age. Lifetime
  // averages were tried first and flagged Facebook carousels that sat above
  // the platform median, because a few large Reels had lifted the mean.
  const ageHours = THRESHOLDS.formatAgeHours;
  const formats = await getFormatBenchmarkAtAge(ageHours);

  for (const row of formats) {
    const status = formatStatus(
      row.medianViews,
      row.platformMedian,
      row.posts,
      `the platform median at ${ageHours} hours`
    );
    if (status && status.level === 'bad') {
      items.push({
        level: status.level,
        title: `${platformLabel(row.platform)} ${formatLabel(row.format)} underperforms`,
        detail: status.reason,
        href: '/dashboard/recent',
        action: 'Consider posting less of this format and more of what is working',
      });
    }
  }

  // Links created but never clicked.
  const idle = await sql(`
    SELECT l.slug, l.created_at, COUNT(c.id)::int AS clicks
    FROM links l LEFT JOIN human_clicks c ON c.slug = l.slug
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
    FROM content_posts
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

  // Cover photo and profile picture changes that Facebook returned as posts.
  // Kept, flagged and listed, never silently dropped.
  const updates = await getPageUpdates();
  const updateCount = updates.reduce((n, u) => n + u.posts, 0);
  const breakdown = updates.map((u) => `${u.posts} ${u.reason}`).join(', ');
  const updateStatus = pageUpdateStatus(updateCount, breakdown);
  if (updateStatus) {
    items.push({
      level: updateStatus.level,
      title: `${updateCount} blank Facebook ${updateCount === 1 ? 'post is a Page update' : 'posts are Page updates'}`,
      detail: updateStatus.reason,
      href: '/admin/posts?filter=updates',
      action: 'Check none of them is a real post that lost its caption. They are kept out of every figure',
    });
  }

  return items.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}
