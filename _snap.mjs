import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
config({ path: '.env.local.production-pull', override: true, quiet: true });
const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const LATEST = `WITH latest AS (SELECT DISTINCT ON (m.post_id) m.post_id, m.views, m.reach, m.engagement, m.likes, m.comments, m.saves, m.shares, m.profile_visits, m.link_clicks, m.recorded_on FROM post_metrics m ORDER BY m.post_id, m.recorded_on DESC)`;

const out = {};
out.generatedAt = new Date().toISOString();

out.overview = (await sql(`${LATEST} SELECT COUNT(*)::int AS posts, COALESCE(SUM(l.views),0)::int AS views, COALESCE(SUM(l.engagement),0)::int AS engagement, MIN(p.published_at) AS earliest, MAX(p.published_at) AS latest_post FROM posts p JOIN latest l ON l.post_id=p.id`))[0];
out.overview.clicks = (await sql`SELECT COUNT(*)::int AS n FROM click_events`)[0].n;
out.overview.links = (await sql`SELECT COUNT(*)::int AS n FROM links`)[0].n;
out.overview.lastSynced = (await sql`SELECT MAX(last_synced_at) AS at FROM posts`)[0].at;

const d = 30;
out.deltas = (await sql(`${LATEST} SELECT
  COUNT(*) FILTER (WHERE p.published_at >= NOW() - INTERVAL '${d} days')::int AS cur_posts,
  COUNT(*) FILTER (WHERE p.published_at >= NOW() - INTERVAL '${d*2} days' AND p.published_at < NOW() - INTERVAL '${d} days')::int AS prev_posts,
  COALESCE(SUM(l.views) FILTER (WHERE p.published_at >= NOW() - INTERVAL '${d} days'),0)::int AS cur_views,
  COALESCE(SUM(l.views) FILTER (WHERE p.published_at >= NOW() - INTERVAL '${d*2} days' AND p.published_at < NOW() - INTERVAL '${d} days'),0)::int AS prev_views
  FROM posts p JOIN latest l ON l.post_id=p.id`))[0];
out.deltas.cur_clicks = (await sql(`SELECT COUNT(*) FILTER (WHERE clicked_at >= NOW() - INTERVAL '${d} days')::int AS n FROM click_events`))[0].n;
out.deltas.prev_clicks = (await sql(`SELECT COUNT(*) FILTER (WHERE clicked_at >= NOW() - INTERVAL '${d*2} days' AND clicked_at < NOW() - INTERVAL '${d} days')::int AS n FROM click_events`))[0].n;

out.leaderboard = await sql(`${LATEST} SELECT p.id, p.platform, p.format, p.permalink, p.published_at, LEFT(p.caption, 120) AS caption, p.content_theme, l.views, l.engagement FROM posts p JOIN latest l ON l.post_id=p.id ORDER BY l.views DESC NULLS LAST LIMIT 30`);
out.medians = await sql(`${LATEST} SELECT p.platform, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.views) AS median_views, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CASE WHEN l.views>0 THEN l.engagement::float/l.views ELSE 0 END) AS median_eng FROM posts p JOIN latest l ON l.post_id=p.id GROUP BY p.platform`);
out.platforms = await sql(`${LATEST}, used AS (SELECT DISTINCT platform FROM posts UNION SELECT DISTINCT platform FROM links), ps AS (SELECT p.platform, COUNT(*)::int AS posts, COALESCE(SUM(l.views),0)::int AS views, COALESCE(ROUND(AVG(l.views)),0)::int AS avg_views, COALESCE(SUM(l.engagement),0)::int AS engagement FROM posts p JOIN latest l ON l.post_id=p.id GROUP BY p.platform) SELECT u.platform, ps.posts, ps.views, ps.avg_views, ps.engagement, (ps.platform IS NOT NULL) AS has_posts FROM used u LEFT JOIN ps ON ps.platform=u.platform ORDER BY COALESCE(ps.views,-1) DESC`);
out.clicksByPlatform = await sql(`SELECT k.platform, COUNT(DISTINCT k.slug)::int AS links, COUNT(c.id)::int AS clicks FROM links k LEFT JOIN click_events c ON c.slug=k.slug GROUP BY k.platform ORDER BY clicks DESC`);
out.formats = await sql(`${LATEST} SELECT p.platform, p.format, COUNT(*)::int AS posts, COALESCE(ROUND(AVG(l.views)),0)::int AS avg_views, COALESCE(ROUND(AVG(l.engagement)),0)::int AS avg_engagement, COALESCE(SUM(l.views),0)::int AS views FROM posts p JOIN latest l ON l.post_id=p.id GROUP BY p.platform, p.format ORDER BY avg_views DESC`);
out.formatSplit = await sql(`SELECT format AS key, COUNT(*)::int AS value FROM posts WHERE format IS NOT NULL GROUP BY format ORDER BY value DESC`);
out.tagSplit = await sql(`SELECT content_theme AS key, COUNT(*)::int AS value FROM posts WHERE content_theme IS NOT NULL AND content_theme<>'' GROUP BY content_theme ORDER BY value DESC`);
out.tagCounts = (await sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE content_theme IS NOT NULL AND content_theme<>'')::int AS tagged FROM posts`)[0];
out.ctas = await sql(`SELECT COALESCE(k.cta_type,'unset') AS cta_type, COUNT(DISTINCT k.slug)::int AS links, COUNT(c.id)::int AS clicks FROM links k LEFT JOIN click_events c ON c.slug=k.slug GROUP BY k.cta_type ORDER BY clicks DESC`);
out.funnel = await sql(`WITH cl AS (SELECT slug, COUNT(*)::int AS clicks FROM click_events GROUP BY slug), ga AS (SELECT content AS slug, SUM(sessions)::int AS sessions, SUM(engaged_sessions)::int AS engaged FROM site_sessions GROUP BY content) SELECT l.slug, l.platform, COALESCE(c.clicks,0) AS clicks, COALESCE(g.sessions,0) AS sessions, COALESCE(g.engaged,0) AS engaged FROM links l LEFT JOIN cl c ON c.slug=l.slug LEFT JOIN ga g ON g.slug=l.slug ORDER BY COALESCE(c.clicks,0) DESC`);
out.weeklyViews = await sql(`${LATEST} SELECT TO_CHAR(DATE_TRUNC('week',p.published_at),'YYYY-MM-DD') AS week, COUNT(*)::int AS posts, COALESCE(SUM(l.views),0)::int AS views FROM posts p JOIN latest l ON l.post_id=p.id WHERE p.published_at IS NOT NULL GROUP BY 1 ORDER BY 1`);
out.weeklyClicks = await sql(`SELECT TO_CHAR(DATE_TRUNC('week',clicked_at),'YYYY-MM-DD') AS week, COUNT(*)::int AS clicks FROM click_events GROUP BY 1 ORDER BY 1`);
out.audience = await sql(`SELECT DISTINCT ON (platform) platform, followers, source, recorded_on FROM audience_snapshots WHERE followers IS NOT NULL ORDER BY platform, recorded_on DESC`);
out.followerWeeks = await sql(`SELECT TO_CHAR(DATE_TRUNC('week',recorded_on),'YYYY-MM-DD') AS week, SUM(new_followers)::int AS gained FROM audience_snapshots WHERE new_followers IS NOT NULL GROUP BY 1 ORDER BY 1`);

writeFileSync('./_snapshot.json', JSON.stringify(out));
const kb = (JSON.stringify(out).length/1024).toFixed(1);
console.log('snapshot written:', kb, 'KB');
console.log('posts', out.overview.posts, '| leaderboard', out.leaderboard.length, '| platforms', out.platforms.length, '| funnel', out.funnel.length);
