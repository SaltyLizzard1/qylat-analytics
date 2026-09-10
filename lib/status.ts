/**
 * Status thresholds for the whole dashboard.
 *
 * Three states, as specified:
 *   good    green   working, leave it alone
 *   warning yellow  needs attention
 *   bad     red     work on immediately
 *
 * Every threshold in this project lives in THRESHOLDS below. Change a number
 * here and every badge, every table and the attention panel on the overview
 * all move together. Do not hardcode a comparison anywhere else.
 *
 * Colour never travels alone. Each status carries a text label, because red
 * and green are indistinguishable to a significant share of readers and
 * because a printed or greyscale copy has to stay readable.
 */

export type Level = 'good' | 'warning' | 'bad';

export type Status = {
  level: Level;
  /** Short label shown beside the colour. Never omitted. */
  label: string;
  /** Plain sentence saying why, for tooltips and the attention list. */
  reason: string;
};

export const LEVEL_LABEL: Record<Level, string> = {
  good: 'Good',
  warning: 'Needs attention',
  bad: 'Work on immediately',
};

/** Sort order for lists: worst first. */
export const LEVEL_RANK: Record<Level, number> = { bad: 0, warning: 1, good: 2 };

export const THRESHOLDS = {
  /**
   * Sessions per click. Two thirds of clicks never becoming a session is
   * normal for social, since in-app browsers, ad blockers and bots all sit in
   * the way, so these are deliberately forgiving.
   */
  arrivalRate: { good: 0.5, warning: 0.25 },

  /** Engagement per view on a post. */
  engagementRate: { good: 0.05, warning: 0.02 },

  /** A format's average views as a ratio of its platform's average. */
  formatVsPlatform: { good: 1.0, warning: 0.6 },

  /** Days a link can sit with zero clicks before it is worth asking why. */
  idleLinkDays: { warning: 14, bad: 30 },

  /** Share of synced posts still missing a content theme. */
  untaggedShare: { warning: 0.25, bad: 0.75 },

  /** New followers over the recorded window. */
  followerGrowth: { good: 30, warning: 10 },

  /** Minimum sample before a status is claimed at all. */
  minSampleClicks: 5,
  minSampleViews: 50,
  minSamplePosts: 3,
} as const;

function level(value: number, good: number, warning: number): Level {
  if (value >= good) return 'good';
  if (value >= warning) return 'warning';
  return 'bad';
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

/**
 * Sessions per click.
 * Returns null below the minimum sample: too few clicks is no data, not a
 * problem, and colouring it red would invent a finding.
 */
export function arrivalStatus(sessions: number | null, clicks: number | null): Status | null {
  if (!clicks || clicks < THRESHOLDS.minSampleClicks) return null;
  const rate = (sessions ?? 0) / clicks;
  const l = level(rate, THRESHOLDS.arrivalRate.good, THRESHOLDS.arrivalRate.warning);
  return {
    level: l,
    label: LEVEL_LABEL[l],
    reason: `${fmtPct(rate)} of ${clicks} clicks became a session`,
  };
}

/** Engagement per view. */
export function engagementStatus(engagement: number | null, views: number | null): Status | null {
  if (!views || views < THRESHOLDS.minSampleViews) return null;
  const rate = (engagement ?? 0) / views;
  const l = level(rate, THRESHOLDS.engagementRate.good, THRESHOLDS.engagementRate.warning);
  return {
    level: l,
    label: LEVEL_LABEL[l],
    reason: `${fmtPct(rate)} engagement across ${views.toLocaleString()} views`,
  };
}

/** A format measured against its own platform's average views per post. */
export function formatStatus(
  avgViews: number | null,
  platformAvg: number | null,
  posts: number | null
): Status | null {
  if (!platformAvg || !posts || posts < THRESHOLDS.minSamplePosts) return null;
  const ratio = (avgViews ?? 0) / platformAvg;
  const l = level(ratio, THRESHOLDS.formatVsPlatform.good, THRESHOLDS.formatVsPlatform.warning);
  return {
    level: l,
    label: LEVEL_LABEL[l],
    reason: `${fmtPct(ratio)} of the platform average, over ${posts} posts`,
  };
}

/** A link that exists but has never been clicked. */
export function idleLinkStatus(clicks: number, createdAt: string | Date | null): Status | null {
  if (clicks > 0) return null;
  if (!createdAt) return null;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const days = Math.floor((Date.now() - created.getTime()) / 86_400_000);
  if (days < THRESHOLDS.idleLinkDays.warning) return null;
  const l: Level = days >= THRESHOLDS.idleLinkDays.bad ? 'bad' : 'warning';
  return {
    level: l,
    label: LEVEL_LABEL[l],
    reason: `no clicks in ${days} days since it was created`,
  };
}

/** Share of posts with no content theme, which blocks the theme views. */
export function taggingStatus(untagged: number, total: number): Status | null {
  if (total === 0) return null;
  const share = untagged / total;
  if (share < THRESHOLDS.untaggedShare.warning) {
    return { level: 'good', label: LEVEL_LABEL.good, reason: `${untagged} of ${total} posts untagged` };
  }
  const l: Level = share >= THRESHOLDS.untaggedShare.bad ? 'bad' : 'warning';
  return {
    level: l,
    label: LEVEL_LABEL[l],
    reason: `${untagged} of ${total} posts have no theme, so theme views stay empty`,
  };
}

/** Follower growth over the recorded window. */
export function growthStatus(gained: number | null, days: number): Status | null {
  if (days < 7) return null;
  const value = gained ?? 0;
  const l = level(value, THRESHOLDS.followerGrowth.good, THRESHOLDS.followerGrowth.warning);
  return {
    level: l,
    label: LEVEL_LABEL[l],
    reason: `${value} new followers over ${days} days`,
  };
}
