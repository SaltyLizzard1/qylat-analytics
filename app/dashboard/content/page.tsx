import Link from 'next/link';
import { parsePeriod, periodPhrase, type PeriodParams } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { PlatformFilter } from '@/components/PlatformFilter';
import { parsePlatform, withFilters } from '@/lib/overview';
import { getCombined, totalOf, type Item } from '@/lib/combined';
import { describeEvidence } from '@/lib/automatch';
import { PageHeader, SectionHeading, Disclosure } from '@/components/charts';
import { FilterBar, PlatformChip, PostPicture, QuietChip } from '@/components/overview';
import { AccountBars, CopyLine, TotalBlock, face, oneLine, publishedText } from '@/components/content';
import { GroupButton } from '@/components/GroupControls';
import { THRESHOLDS } from '@/lib/status';
import { C, CARD, RADIUS, full, platformLabel } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/**
 * Content: one piece of content across Instagram, the Facebook Page and the
 * Facebook Profile.
 *
 * Three sections, in the order they need attention. Possible matches are
 * suggestions and are never merged until confirmed. Linked content is what
 * has been confirmed, with a combined total and each account's figure. Posts
 * not linked to anything follow, each a way into linking it by hand.
 *
 * What may be added across accounts is decided in lib/combined.ts. This page
 * changes no account total, ranking or benchmark anywhere else.
 */

const SUGGESTIONS_SHOWN = 6;

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<PeriodParams & { platform?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const platform = parsePlatform(sp.platform);
  const { linking, items, suggestions } = await getCombined(period, platform);

  const groups = items.filter((i) => i.groupId !== null);
  const singles = items.filter((i) => i.groupId === null);
  const itemHref = (key: number) => withFilters(`/dashboard/content/item?post=${key}`, period, platform);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Content"
        meta={[
          { label: 'Linked across accounts', value: String(groups.length) },
          { label: 'Possible matches', value: String(suggestions.length) },
          { label: 'Not linked', value: String(singles.length) },
        ]}
      />

      <FilterBar>
        <PeriodPicker period={period} bare />
        <PlatformFilter current={platform} />
      </FilterBar>

      {!linking && (
        <p className="text-sm px-4 py-3" style={{ ...CARD, color: C.text }}>
          <span style={{ fontWeight: 700 }}>Linking is off.</span>{' '}
          <span style={{ color: C.muted }}>
            Migration 012 has not been applied to this database, so nothing can be confirmed, linked or unlinked yet.
            Possible matches are still shown.
          </span>
        </p>
      )}

      {suggestions.length > 0 && (
        <>
          <SectionHeading note={`Suggestions only · not merged until confirmed · published ${periodPhrase(period)}`}>
            Possible matches
          </SectionHeading>
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {suggestions.slice(0, SUGGESTIONS_SHOWN).map((s) => (
              <li key={`${s.a.id}-${s.b.id}`} className="p-4 flex flex-col gap-3" style={{ ...CARD, border: `2px dashed ${C.border}` }}>
                <p className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: C.muted }}>
                  <QuietChip>Not confirmed</QuietChip>
                  {s.reason}
                </p>
                <CopyLine c={s.a} />
                <CopyLine c={s.b} />
                {linking && (
                  <div className="flex flex-wrap items-start gap-2">
                    <GroupButton op="link" a={s.a.id} b={s.b.id} label="Same content" about={`${oneLine(s.a.caption, 40)} on ${platformLabel(s.a.platform)} and ${platformLabel(s.b.platform)}`} primary />
                    <GroupButton op="dismiss" a={s.a.id} b={s.b.id} label="Not the same" about={`${oneLine(s.a.caption, 40)} on ${platformLabel(s.a.platform)} and ${platformLabel(s.b.platform)}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {suggestions.length > SUGGESTIONS_SHOWN && (
            <p className="text-xs" style={{ color: C.muted }}>
              {suggestions.length - SUGGESTIONS_SHOWN} more possible matches appear as these are answered.
            </p>
          )}
        </>
      )}

      <SectionHeading note={`Linked by you or automatically · latest recorded figures, each as old as its own read date · any copy published ${periodPhrase(period)}`}>
        Linked content
      </SectionHeading>
      {groups.length === 0 ? (
        <p className="text-sm px-4 py-3" style={{ ...CARD, color: C.muted }}>
          Nothing is linked in this window yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {groups.map((g) => (
            <GroupCard key={g.key} item={g} href={itemHref(g.key)} linking={linking} />
          ))}
        </ul>
      )}

      <SectionHeading note={`One account each · open a post to link it to a copy on another account · published ${periodPhrase(period)}`}>
        Not linked
      </SectionHeading>
      {singles.length === 0 ? (
        <p className="text-sm px-4 py-3" style={{ ...CARD, color: C.muted }}>
          No unlinked post in this window.
        </p>
      ) : (
        <ul style={CARD} className="px-4 py-1">
          {singles.map((s, i) => {
            const c = s.copies[0];
            return (
              <li key={s.key} style={{ borderTop: i > 0 ? `1px solid ${C.neutral}` : undefined }}>
                <Link
                  href={itemHref(s.key)}
                  className="flex items-center gap-3 py-2.5 row-link -mx-2 px-2"
                  style={{ textDecoration: 'none', borderRadius: RADIUS.md }}
                  aria-label={`${oneLine(c.caption, 60)}, ${platformLabel(c.platform)}, published ${publishedText(c)}. Open to see or link`}
                >
                  <PostPicture id={c.id} platform={c.platform} src={c.thumbnail_url} publishedAt={c.published_at} label={platformLabel(c.platform)} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate" style={{ color: C.text, fontWeight: 600 }}>
                      {oneLine(c.caption)}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 mt-1 text-xs" style={{ color: C.muted }}>
                      <PlatformChip platform={c.platform} />
                      <span>{publishedText(c)}</span>
                    </span>
                  </span>
                  <span className="text-right" style={{ flexShrink: 0 }}>
                    <span className="block tabular-nums" style={{ color: c.views === null ? C.muted : C.text, fontWeight: c.views === null ? 500 : 800, fontSize: c.views === null ? '0.8rem' : '1rem' }}>
                      {c.views === null ? (c.read_at === null ? 'Not read yet' : 'No figure') : full(c.views)}
                    </span>
                    <span className="block text-xs" style={{ color: C.muted }}>
                      views
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Disclosure summary="What is added across accounts, and what is not">
        <ul className="space-y-2">
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Total reported views</span> adds each account&apos;s
            views, each the post&apos;s running total at its own last read. It is not unique viewers and not reach,
            and the figures were not read at the same moment: each is the latest recorded, with its read date on
            the breakdown.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>A Facebook Profile figure is added only when it was collected with a confirmed scope.</span>{' '}
            Profile views recorded before the scope was confirmed are shown beside the sum and not included, and
            the sum is then named for the accounts it holds. Profile comments and shares are never added.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Stale reading</span> marks a figure read more than{' '}
            {THRESHOLDS.staleReadHours} hours before the newest reading for the same content.{' '}
            <span style={{ color: C.text, fontWeight: 600 }}>Partial</span> marks a sum that is missing a figure
            that belongs in it.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>No copy linked</span> means no post on that account has
            been linked to this content. It does not say the content was never posted there.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Likes and reactions are never added.</span> Instagram
            reports likes, Facebook reports reactions of every kind. Engagement, reach and viewers are not combined.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Linked automatically</span> means the complete caption
            is identical on each account once emoji are ignored, each account has exactly one post with it, and the copies were published
            within {THRESHOLDS.autoLinkToleranceHours} hours of each other. Undo separates them and they are not
            linked again. A caption that only opens the same way stays a suggestion.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Linking does not make a figure newer.</span> Each
            account&apos;s figure is as old as its own last read. The daily sync re-reads linked Instagram and Page
            posts for {THRESHOLDS.linkedRefreshDays} days. The Profile is read only when you run a collection, and
            only for posts published in the last 28 days.
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}

/** One confirmed piece of content: what it is, where it ran, the combined views and each account's share. */
function GroupCard({ item, href, linking }: { item: Item; href: string; linking: boolean }) {
  const f = face(item);
  const evidence = item.copies.find((c) => c.evidence)?.evidence ?? null;
  const views = totalOf(item, 'views');
  return (
    <li className="p-4 flex flex-col gap-3" style={CARD}>
      <div className="flex items-start gap-3 min-w-0">
        <PostPicture id={f.id} platform={f.platform} src={f.thumbnail_url} publishedAt={f.published_at} label={platformLabel(f.platform)} size={64} />
        <div className="min-w-0">
          <p className="text-sm" style={{ color: C.text, fontWeight: 700, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
            {oneLine(f.caption, 110)}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs" style={{ color: C.muted }}>
            {item.copies.map((c) => (
              <PlatformChip key={c.id} platform={c.platform}>
                {platformLabel(c.platform)} · {publishedText(c)}
              </PlatformChip>
            ))}
          </p>
        </div>
      </div>
      {item.auto !== 'none' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: C.muted }}>
            <QuietChip>{item.auto === 'all' ? 'Linked automatically' : 'Partly linked automatically'}</QuietChip>
            {evidence && <span>{describeEvidence(evidence)}</span>}
          </p>
          {linking && <GroupButton op="undo" a={item.key} label="Undo" about={`the automatic link for ${oneLine(f.caption, 40)}`} />}
        </div>
      )}
      <TotalBlock metric="views" total={views} item={item} href={href} />
      <AccountBars item={item} metric="views" />
    </li>
  );
}
