/**
 * Which copies of the same content can be linked without asking.
 *
 * A pure function over posts already loaded: no database, no imports, so the
 * same code plans a link, previews one, and is tested. lib/autolink.ts loads
 * the posts and writes what this decides.
 *
 * The rule, all of it required:
 *
 *   1. The complete caption is identical on every copy, after collapsing
 *      whitespace and nothing else. An emoji or a hashtag present on one
 *      account and not on another is a different caption. Those stay as
 *      suggestions for Liz.
 *   2. The caption is known to be complete. API captions always are. A
 *      Profile caption counts only when the collector marked it complete: the
 *      Content Library shows a shortened title, and a shortened title that
 *      happens to equal a full caption is not evidence.
 *   3. The caption is at least `minCaption` characters. A blank or two word
 *      caption identifies nothing.
 *   4. No account has used that exact caption on more than one post, at any
 *      time. A reused caption cannot say which post is the copy.
 *   5. Exactly one candidate per account, on at least two accounts, and every
 *      pair of copies was published within `toleranceHours` of each other.
 *   6. No pair among them was dismissed or unlinked by Liz. A rejected match
 *      is never recreated.
 *
 * The tolerance, and why it is not "a few minutes". Checked on production on
 * 7 Oct 2026, across every pair of posts on different accounts with an
 * identical full caption:
 *
 *   Page and Instagram     16 pairs: 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1,
 *                          17, 32 and 787 minutes apart
 *   Profile and Instagram  4 pairs: 0, 0, 623 and 791 minutes apart
 *   Page and Profile       3 pairs: 4, 32 and 622 minutes apart
 *
 * Most are scheduled together and land in the same minute. But two real
 * pieces of content went out to one account in the morning and the others
 * that evening, 10 to 13 hours apart, and a tolerance of minutes would leave
 * exactly those unlinked. API times are to the second. Profile times are to
 * the minute, read from Facebook's label ("Oct 2 at 5:32 PM"), so a gap is
 * never known closer than a minute. 24 hours covers the widest known gap
 * (13 hours 11 minutes) with room, and stays inside one day so a caption
 * reposted another week is not swept in. What keeps a tolerance that wide
 * safe is rules 1 and 4, not the clock.
 *
 * Facebook's "Cross posted" marker on a Profile post is recorded as
 * supporting evidence where the collector has it. It says the post has an
 * Instagram twin, not which one, so it never creates or blocks a link.
 */

export type MatchPost = {
  id: number;
  platform: string;
  /** ISO timestamp. */
  published_at: string;
  caption: string | null;
  /** True, false, or null when not recorded. Only the Profile carries this. */
  caption_complete: boolean | null;
  /** Facebook's own "Cross posted" marker on a Profile post, or null when not recorded. */
  cross_posted: boolean | null;
};

export type MatchOptions = { toleranceHours: number; minCaption: number };

export type Evidence = {
  rule: 'identical-caption-v1';
  caption_length: number;
  accounts: string[];
  /** The widest gap between any two copies, in seconds. */
  max_gap_seconds: number;
  tolerance_hours: number;
  /** Facebook's marker on the Profile copy: true, false, or null when not recorded or no Profile copy. */
  profile_cross_posted: boolean | null;
};

export type PlannedLink = {
  /** An existing group these posts join, or null for a new group. */
  groupId: number | null;
  /** Every post that will be in the group afterwards. */
  members: number[];
  /** The posts this plan adds. */
  add: number[];
  evidence: Evidence;
};

export type Excluded = { posts: number[]; reason: string };

/** Whitespace collapsed and nothing else changed. Two captions match only if this is equal. */
export function normaliseCaption(caption: string | null): string {
  return (caption ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

const HOUR = 3_600_000;

function gapMs(a: MatchPost, b: MatchPost): number {
  return Math.abs(new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * What can be linked now, and what looked like a match and was left alone,
 * with the reason. `groupOf` maps a post to its current group. `rejected`
 * holds "smaller-larger" id pairs Liz dismissed or unlinked.
 */
export function planAutoLinks(
  posts: MatchPost[],
  groupOf: Map<number, number>,
  rejected: Set<string>,
  opts: MatchOptions
): { links: PlannedLink[]; excluded: Excluded[] } {
  const links: PlannedLink[] = [];
  const excluded: Excluded[] = [];

  const byCaption = new Map<string, MatchPost[]>();
  for (const p of posts) {
    const c = normaliseCaption(p.caption);
    if (c.length === 0) continue;
    byCaption.set(c, [...(byCaption.get(c) ?? []), p]);
  }

  // Who is in each existing group, to keep one post per account.
  const membersOf = new Map<number, MatchPost[]>();
  const byId = new Map(posts.map((p) => [p.id, p]));
  for (const [postId, groupId] of groupOf) {
    const p = byId.get(postId);
    if (p) membersOf.set(groupId, [...(membersOf.get(groupId) ?? []), p]);
  }

  for (const [caption, cluster] of byCaption) {
    const accounts = [...new Set(cluster.map((p) => p.platform))];
    if (accounts.length < 2) continue; // One account only: nothing to link.
    const ids = cluster.map((p) => p.id).sort((a, b) => a - b);

    if (caption.length < opts.minCaption) {
      excluded.push({ posts: ids, reason: `Caption is ${caption.length} characters, too short to identify content` });
      continue;
    }
    const reused = accounts.filter((a) => cluster.filter((p) => p.platform === a).length > 1);
    if (reused.length > 0) {
      excluded.push({ posts: ids, reason: `Caption used on more than one ${reused.join(' and ')} post, so the copy is ambiguous` });
      continue;
    }
    const unsure = cluster.filter((p) => p.platform === 'facebook-personal' && p.caption_complete !== true);
    const usable = cluster.filter((p) => !unsure.includes(p));
    // Reported only while the post stands alone. One Liz already linked by hand needs no reason.
    const unsureAlone = unsure.filter((p) => !groupOf.has(p.id));
    if (unsureAlone.length > 0) {
      excluded.push({ posts: unsureAlone.map((p) => p.id), reason: 'Profile caption is not known to be complete' });
    }
    if (new Set(usable.map((p) => p.platform)).size < 2) continue;

    const usableIds = usable.map((p) => p.id).sort((a, b) => a - b);
    let widest = 0;
    let turnedDown = false;
    for (let i = 0; i < usable.length; i++) {
      for (let j = i + 1; j < usable.length; j++) {
        widest = Math.max(widest, gapMs(usable[i], usable[j]));
        if (rejected.has(pairKey(usable[i].id, usable[j].id))) turnedDown = true;
      }
    }
    if (turnedDown) {
      excluded.push({ posts: usableIds, reason: 'You dismissed or unlinked this match' });
      continue;
    }
    if (widest > opts.toleranceHours * HOUR) {
      excluded.push({
        posts: usableIds,
        reason: `Published ${Math.round(widest / HOUR)} hours apart, beyond the ${opts.toleranceHours} hour tolerance`,
      });
      continue;
    }

    const groups = [...new Set(usable.map((p) => groupOf.get(p.id)).filter((g): g is number => g !== undefined))];
    if (groups.length > 1) {
      excluded.push({ posts: usableIds, reason: 'Copies are already in different groups' });
      continue;
    }
    const add = usable.filter((p) => !groupOf.has(p.id));
    if (add.length === 0) continue; // Already together.

    const groupId = groups[0] ?? null;
    const existing = groupId === null ? [] : (membersOf.get(groupId) ?? []);
    const after = [...existing.filter((p) => !usable.includes(p)), ...usable];
    if (new Set(after.map((p) => p.platform)).size !== after.length) {
      excluded.push({ posts: usableIds, reason: 'The existing group already has a post on one of these accounts' });
      continue;
    }

    const profile = usable.find((p) => p.platform === 'facebook-personal');
    links.push({
      groupId,
      members: after.map((p) => p.id).sort((a, b) => a - b),
      add: add.map((p) => p.id).sort((a, b) => a - b),
      evidence: {
        rule: 'identical-caption-v1',
        caption_length: caption.length,
        accounts: [...new Set(after.map((p) => p.platform))].sort(),
        max_gap_seconds: Math.round(widest / 1000),
        tolerance_hours: opts.toleranceHours,
        profile_cross_posted: profile ? profile.cross_posted : null,
      },
    });
  }
  return { links, excluded };
}

/** The evidence in a sentence, for the page. */
export function describeEvidence(e: Evidence): string {
  const minutes = Math.round(e.max_gap_seconds / 60);
  const apart =
    minutes < 1 ? 'published in the same minute' : minutes < 90 ? `published ${minutes} minutes apart` : `published ${Math.round(minutes / 60)} hours apart`;
  const marker =
    e.profile_cross_posted === true
      ? '. Facebook marks the Profile copy as cross posted'
      : e.profile_cross_posted === false
        ? '. Facebook does not mark the Profile copy as cross posted'
        : '';
  return `Identical ${e.caption_length} character caption, ${apart}${marker}`;
}
