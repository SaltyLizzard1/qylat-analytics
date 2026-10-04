import {
  getProfileAudienceFigures,
  getProfileCollections,
  getProfileFollowers,
  getProfilePosts,
  type ProfilePost,
} from '@/lib/profile';
import { StatTile, Panel, Empty, SectionHeading, PageHeader, Disclosure } from '@/components/charts';
import { DataRows, Sub, type Column } from '@/components/DataRows';
import { C, full, shortDate, shortDateTime } from '@/lib/theme';
import { BackLink } from '@/components/overview';
import { parsePlatform, withFilters } from '@/lib/overview';
import { parsePeriod, type PeriodParams } from '@/lib/period';

export const dynamic = 'force-dynamic';

/**
 * The personal Facebook profile, on its own page.
 *
 * Nothing here is a benchmark and nothing here feeds one. The figures come
 * from a local scraper reading Facebook's own screens, so each is shown as it
 * was read, under Facebook's label, with the time it was read.
 *
 * Three things this page never does:
 *   - show a missing figure as zero
 *   - compare a library figure with an earlier reading, because whether those
 *     are lifetime or within period totals is not verified
 *   - present a converted publish time as confirmed. The time is shown as
 *     Facebook displayed it.
 *
 * No colour is used. Colour means status or identity on this dashboard, and
 * nothing on this page has a threshold to be judged against.
 */

const STALE_HOURS = 36;

/** A figure as read, or the reason there is no number. Never a zero that was not shown. */
function figure(post: ProfilePost, key: string): React.ReactNode {
  const f = post.figures[key];
  if (!f) return <span style={{ color: C.muted }}>Not collected</span>;
  if (f.value === null) return <span style={{ color: C.muted }}>Not shown</span>;
  return full(Number(f.value));
}

function captionOf(post: ProfilePost): string {
  if (post.kind === 'story') return 'Story';
  if (post.caption) {
    // Cut by code point, not by UTF-16 unit. A caption with an emoji at the
    // cut was sliced through the middle of it, and the half character rendered
    // differently on the server and in the browser, which broke hydration.
    const chars = Array.from(post.caption);
    return chars.length > 56 ? `${chars.slice(0, 56).join('')}...` : post.caption;
  }
  return post.caption_complete ? 'No caption' : 'Caption not read';
}

function signed(n: number): string {
  return n > 0 ? `+${full(n)}` : full(n);
}

const num = (key: string, label: string): Column<ProfilePost> => ({
  key,
  label,
  align: 'right',
  width: '76px',
  render: (p) => figure(p, key),
});

/**
 * What sits under a caption: the publish time exactly as Facebook showed it,
 * then only what is unusual about this row. A post that is in the latest
 * library read says nothing more, so the common case stays quiet.
 */
function under(p: ProfilePost): string {
  const parts = [p.published_label ?? 'Publish time not read'];
  if (p.caption && p.caption_complete === false) parts.push('caption cut short');
  if (p.library_at && !p.in_latest_library) parts.push(`library figures from ${shortDate(p.library_at)}`);
  if (!p.library_at) parts.push('never in a library read');
  return parts.join(' · ');
}

const POST_COLUMNS: Column<ProfilePost>[] = [
  {
    key: 'post',
    label: 'Post',
    width: 'minmax(200px, 1fr)',
    render: (p) => (
      <div>
        <div>{captionOf(p)}</div>
        <Sub>{under(p)}</Sub>
      </div>
    ),
  },
  num('library:Views', 'Views'),
  num('library:Viewers', 'Viewers'),
  num('library:Engagement', 'Engaged'),
  num('timeline:Reactions', 'Reactions'),
  num('timeline:Comments', 'Comments'),
  num('timeline:Shares', 'Shares'),
];

const STORY_COLUMNS: Column<ProfilePost>[] = [
  {
    key: 'story',
    label: 'Story',
    width: 'minmax(200px, 1fr)',
    render: (p) => under(p),
  },
  num('library:Views', 'Views'),
  num('library:Viewers', 'Viewers'),
  num('library:Engagement', 'Engaged'),
];

const STORIES_SHOWN = 10;

type Collection = Record<string, unknown>;

const COLLECTION_COLUMNS: Column<Collection>[] = [
  { key: 'at', label: 'Collected', width: '150px', render: (c) => shortDateTime(c.collected_at as string) },
  ...(['timeline', 'library', 'audience'] as const).map(
    (source): Column<Collection> => ({
      key: source,
      label: source,
      width: '90px',
      render: (c) =>
        c[`${source}_status`] === 'ok' ? 'Read' : <span style={{ fontWeight: 600 }}>Failed</span>,
    })
  ),
  {
    key: 'tz',
    label: 'Publish times',
    width: '150px',
    render: (c) => (c.timezone_check === 'consistent' ? 'Checked' : 'Not confirmed'),
  },
  {
    key: 'unmatched',
    label: 'Not merged',
    align: 'right',
    width: '100px',
    render: (c) => full(Number(c.unmatched)),
  },
];

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<PeriodParams & { platform?: string; back?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  let data;
  try {
    data = await Promise.all([
      getProfileCollections(),
      getProfileFollowers(),
      getProfileAudienceFigures(),
      getProfilePosts(),
    ]);
  } catch (e) {
    // Reported, not hidden: before migration 010 the tables do not exist.
    return (
      <div className="space-y-5">
        <PageHeader title="Facebook Profile" />
        <Empty
          message={`The profile tables could not be read. Migration 010 may not have been run on this database. ${
            e instanceof Error ? e.message : String(e)
          }`}
        />
      </div>
    );
  }

  const [collections, followers, audience, all] = data;
  const latest = collections[0];

  if (!latest) {
    return (
      <div className="space-y-5">
        <PageHeader title="Facebook Profile" />
        <Empty message="No collection has arrived yet. The scraper in scripts/personal-fb sends one per run." />
      </div>
    );
  }

  const posts = all.filter((p) => p.kind === 'post');
  const libraryRead = collections.find((c) => c.library_status === 'ok')?.collected_at as string | undefined;
  const stories = all.filter((p) => p.kind === 'story');
  const hoursSince = (Date.now() - new Date(latest.collected_at as string).getTime()) / 3_600_000;
  const failed = (['timeline', 'library', 'audience'] as const).filter((s) => latest[`${s}_status`] !== 'ok');
  const audienceFigure = (label: string) => audience.find((a) => a.label === label);
  const net = audienceFigure('Net follows');
  const unfollows = audienceFigure('Unfollows');

  let change = 'No earlier total to compare with';
  if (followers?.previous_on) {
    change = followers.is_daily
      ? `${signed(Number(followers.change))} since the day before`
      : `${signed(Number(followers.change))} over ${followers.days} days, since ${shortDate(
          followers.previous_on as string
        )}. Not a daily figure`;
  }

  return (
    <div className="space-y-5">
      {sp.back === 'overview' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <BackLink href={withFilters('/dashboard', period, parsePlatform(sp.platform))}>Back to Overview</BackLink>
          <span className="text-xs" style={{ color: C.muted }}>
            Opened from {period.label.toLowerCase()}, {shortDate(period.startDate)} to {shortDate(period.endDate)}. This
            page shows the latest reading of every stored post, not only that window.
          </span>
        </div>
      )}
      <PageHeader
        title="Facebook Profile"
        lead="The personal profile, read from Facebook's own screens by a local scraper. Kept apart from every benchmark."
        meta={[
          { label: 'Last collection', value: shortDateTime(latest.collected_at as string) },
          { label: 'Sources read', value: `${3 - failed.length} of 3` },
          { label: 'Posts stored', value: String(posts.length) },
        ]}
      />

      {(failed.length > 0 || hoursSince > STALE_HOURS) && (
        <Panel title="Collection needs a look">
          <ul className="text-sm space-y-1" style={{ color: C.text }}>
            {hoursSince > STALE_HOURS && (
              <li>
                Nothing has arrived for {Math.floor(hoursSince)} hours. The figures below are from{' '}
                {shortDateTime(latest.collected_at as string)}.
              </li>
            )}
            {failed.map((s) => (
              <li key={s}>
                The {s} could not be read in the last collection. Its figures below are from an earlier
                one, where there is one.
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <SectionHeading note="Exact totals from the Audience screen">Followers</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          label="Total followers"
          value={followers ? full(Number(followers.followers)) : 'Not read'}
          sub={followers ? `Read ${shortDate(followers.recorded_on as string)}. ${change}` : 'No exact total has been stored'}
        />
        <StatTile
          label="Net follows"
          value={net?.value != null ? full(Number(net.value)) : 'Not shown'}
          sub={net?.period_label ? String(net.period_label) : 'No period read'}
        />
        <StatTile
          label="Unfollows"
          value={unfollows?.value != null ? full(Number(unfollows.value)) : 'Not shown'}
          sub={unfollows?.period_label ? String(unfollows.period_label) : 'No period read'}
        />
      </div>

      <Panel
        title="Posts"
        description={
          libraryRead
            ? `Library figures read ${shortDateTime(libraryRead)}. Times are as Facebook displayed them.`
            : 'The Content Library has not been read yet.'
        }
        detail={{
          summary: 'How to read these figures',
          children: (
            <div className="space-y-2">
              <p>
                Views, Viewers and Engaged (Facebook calls it Engagement) are Content Library figures
                {latest.library_period_label ? `, shown there under "${latest.library_period_label}"` : ''}.
                Reactions, Comments and Shares are the figures on the profile itself.
              </p>
              <p>
                Viewers is Facebook&apos;s own label. It is not reach and is not compared with reach
                anywhere on this dashboard.
              </p>
              <p>
                Whether a Content Library figure is a lifetime total or a total within the period
                shown has not been verified. Each figure is shown as last read and is not compared
                with earlier readings.
              </p>
              <p>
                Not shown means Facebook displayed no number. Not collected means that figure was
                never read for this post. Neither is zero.
              </p>
              <p>
                Publish times are shown as Facebook displayed them. Their conversion from Asia/Bangkok{' '}
                {latest.timezone_check === 'consistent'
                  ? 'was checked in the last collection.'
                  : 'has not been confirmed.'}
              </p>
            </div>
          ),
        }}
      >
        <DataRows
          columns={POST_COLUMNS}
          rows={posts}
          keyOf={(p) => String(p.id)}
          emptyMessage="No posts stored yet."
        />
      </Panel>

      <Panel
        title="Stories"
        description={
          stories.length > STORIES_SHOWN
            ? `The ${STORIES_SHOWN} newest of ${stories.length} stored. Stories appear only in the Content Library.`
            : 'Stories appear only in the Content Library.'
        }
      >
        <DataRows
          columns={STORY_COLUMNS}
          rows={stories.slice(0, STORIES_SHOWN)}
          keyOf={(p) => String(p.id)}
          emptyMessage="No stories stored yet."
        />
      </Panel>

      <Panel
        title="Recent collections"
        description="One row per scraper run. Not merged counts timeline posts that could not be tied to one library row and were left out."
      >
        <DataRows columns={COLLECTION_COLUMNS} rows={collections} keyOf={(c) => String(c.collection_id)} />
      </Panel>

      <Disclosure summary="Why this page is separate">
        The Page and Instagram are read through Meta&apos;s API and measured the same way. The personal
        profile has no API, its figures carry different labels, and they are read at whatever time the
        scraper runs. Mixing them into the platform medians would compare unlike things.
      </Disclosure>
    </div>
  );
}
