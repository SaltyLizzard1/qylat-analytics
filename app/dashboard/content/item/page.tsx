import { parsePeriod, type PeriodParams } from '@/lib/period';
import { SOCIAL_PLATFORMS, parsePlatform, withFilters } from '@/lib/overview';
import { getItemForPost, reactionsLabel, totalOf, type Copy } from '@/lib/combined';
import { PageHeader, SectionHeading, Empty } from '@/components/charts';
import { BackLink, PlatformChip, PostPicture, QuietChip, SampleChip } from '@/components/overview';
import { AccountBars, TotalBlock, face, missingLabel, oneLine, publishedText } from '@/components/content';
import { GroupButton, LinkPicker } from '@/components/GroupControls';
import { C, CARD, EYEBROW, formatLabel, full, platformLabel, shortDate, shortDateTime } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/**
 * One piece of content, account by account: the combined totals, then each
 * account's own post with its figures, when they were read, and the control
 * that unlinks it. Opened from a combined total or an unlinked post, and the
 * way back carries the period and account filters it came with.
 */

function Figure({ label, value, missing }: { label: string; value: number | null; missing: string }) {
  return (
    <div>
      <p style={{ ...EYEBROW, fontSize: '0.68rem' }}>{label}</p>
      <p
        className="tabular-nums"
        style={{ color: value === null ? C.muted : C.text, fontWeight: value === null ? 500 : 800, fontSize: value === null ? '0.8rem' : '1.05rem', lineHeight: 1.3 }}
      >
        {value === null ? missing : full(value)}
      </p>
    </div>
  );
}

export default async function ContentItemPage({
  searchParams,
}: {
  searchParams: Promise<PeriodParams & { platform?: string; post?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const platform = parsePlatform(sp.platform);
  const postId = Number(sp.post);
  const back = withFilters('/dashboard/content', period, platform);
  const { linking, item, all } = Number.isInteger(postId) && postId > 0 ? await getItemForPost(postId) : { linking: false, item: null, all: [] };

  if (!item) {
    return (
      <div className="space-y-4">
        <BackLink href={back}>Back to Content</BackLink>
        <Empty message="That post was not found." />
      </div>
    );
  }

  const f = face(item);
  const grouped = item.groupId !== null;
  const absentLabel = grouped ? 'Not posted here' : 'No copy linked';
  const present = new Set(item.copies.map((c) => c.platform));

  // Posts that could be linked by hand: on an account this content has no
  // copy on, nearest in time first. Any day, any format, caption or none.
  const first = new Date(item.first_published).getTime();
  const options = all
    .filter((c) => !present.has(c.platform))
    .map((c) => ({ c, gap: Math.abs(new Date(c.published_at).getTime() - first) }))
    .sort((x, y) => x.gap - y.gap)
    .slice(0, 60)
    .map(({ c }) => ({ id: c.id, label: `${platformLabel(c.platform)} · ${shortDate(c.published_at)} · ${oneLine(c.caption, 50)}` }));

  return (
    <div className="space-y-4">
      <BackLink href={back}>Back to Content</BackLink>

      <PageHeader
        title={oneLine(f.caption, 70)}
        meta={[
          { label: grouped ? 'Linked across' : 'On', value: `${item.copies.length} account${item.copies.length === 1 ? '' : 's'}` },
          { label: 'First published', value: shortDate(item.first_published) },
          { label: 'Figures', value: 'current totals at each last read' },
        ]}
      />

      <section className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4" style={CARD} aria-label="Combined totals">
        <TotalBlock metric="views" total={totalOf(item, 'views')} />
        <TotalBlock metric="comments" total={totalOf(item, 'comments')} size="small" />
        <TotalBlock metric="shares" total={totalOf(item, 'shares')} size="small" />
      </section>

      <SectionHeading note="Views by account · each bar in its account's colour · likes and reactions are not added">
        Account breakdown
      </SectionHeading>
      <section className="p-4" style={CARD}>
        <AccountBars item={item} metric="views" absentLabel={absentLabel} />
      </section>

      <ul className="flex flex-col gap-3">
        {SOCIAL_PLATFORMS.map((p) => {
          const c = item.copies.find((x) => x.platform === p);
          return c ? (
            <CopyCard key={p} c={c} canUnlink={linking && grouped} />
          ) : (
            <li key={p} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2" style={CARD}>
              <PlatformChip platform={p} />
              <span className="text-sm" style={{ color: C.muted }}>
                {absentLabel}
              </span>
            </li>
          );
        })}
      </ul>

      {linking && options.length > 0 && present.size < SOCIAL_PLATFORMS.length && (
        <>
          <SectionHeading note="For a copy published on another day, or one nothing suggested">Link a copy by hand</SectionHeading>
          <section className="p-4" style={CARD}>
            <LinkPicker postId={item.key} options={options} />
          </section>
        </>
      )}
      {!linking && (
        <p className="text-xs" style={{ color: C.muted }}>
          Linking is off: migration 012 has not been applied to this database.
        </p>
      )}
    </div>
  );
}

/** One account's own post: what it is, its figures under their own names, and when they were read. */
function CopyCard({ c, canUnlink }: { c: Copy; canUnlink: boolean }) {
  const missing = missingLabel(c);
  const identity = (
    <span className="flex items-center gap-3 min-w-0">
      <PostPicture id={c.id} platform={c.platform} src={c.thumbnail_url} publishedAt={c.published_at} label={platformLabel(c.platform)} size={56} />
      <span className="min-w-0">
        <span className="block text-sm" style={{ color: C.text, fontWeight: 600, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
          {oneLine(c.caption, 120)}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs" style={{ color: C.muted }}>
          <PlatformChip platform={c.platform} />
          {c.format && <QuietChip>{formatLabel(c.format)}</QuietChip>}
          <span>Published {publishedText(c, true)}</span>
        </span>
      </span>
    </span>
  );
  return (
    <li id={`post-${c.platform}-${c.id}`} className="p-4 flex flex-col gap-3" style={CARD}>
      {c.permalink ? (
        <a href={c.permalink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }} title="Open the post">
          {identity}
        </a>
      ) : (
        identity
      )}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2">
        <Figure label="Views" value={c.views} missing={missing} />
        <Figure label={reactionsLabel(c.platform)} value={c.reactions} missing={missing} />
        <Figure label="Comments" value={c.comments} missing={missing} />
        <Figure label="Shares" value={c.shares} missing={missing} />
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: C.muted }}>
          <span>{c.read_at ? `Figures read ${shortDateTime(c.read_at)}` : 'Figures not read yet'}</span>
          {c.scope !== 'lifetime' && <SampleChip>Scope not confirmed · not added to totals</SampleChip>}
        </p>
        {canUnlink && <GroupButton op="unlink" a={c.id} label="Unlink" about={`${platformLabel(c.platform)} copy`} />}
      </div>
    </li>
  );
}
