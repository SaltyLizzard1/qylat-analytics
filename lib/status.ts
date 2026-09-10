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
  /** Label shown beside the colour. Never omitted. */
  label: string;
  /** Compact form for dense rows. Falls back to label when absent. */
  shortLabel?: string;
  /** Plain sentence saying why, for tooltips and the attention list. */
  reason: string;
};

/**
 * Two label scales, one colour scale.
 *
 * ACTION is for things you can still change: a link nobody clicked, a funnel
 * leaking, posts left untagged. "Work on immediately" is a sensible thing to
 * say about those.
 *
 * PERFORMANCE is for things already published. A reel from three weeks ago is
 * not urgent, because there is nothing to do to it. What you want to know is
 * how it did against your own typical post, so you can decide what to make
 * next. Calling that "Urgent" was wrong and confusing.
 */
export const LEVEL_LABEL: Record<Level, string> = {
  good: 'Good',
  warning: 'Needs attention',
  bad: 'Work on immediately',
};

/** Compact wording for the ACTION scale. */
export const LEVEL_SHORT: Record<Level, string> = {
  good: 'Good',
  warning: 'Attention',
  bad: 'Urgent',
};

export const PERFORMANCE_LABEL: Record<Level, string> = {
  good: 'Above your usual',
  warning: 'About usual',
  bad: 'Below your usual',
};

export const PERFORMANCE_SHORT: Record<Level, string> = {
  good: 'Strong',
  warning: 'Typical',
  bad: 'Weak',
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
    shortLabel: LEVEL_SHORT[l],
    reason: `${fmtPct(rate)} of ${clicks} clicks became a session`,
  };
}

/**
 * How a published post did against your own median, not against an invented
 * industry threshold.
 *
 * Self-calibrating: as the account grows the median moves and the comparison
 * stays meaningful. A post at 1.3x the median or better reads strong, below
 * 0.7x reads weak, and the wide band between them is deliberately "typical",
 * because most posts are typical and colouring half of them red is noise.
 */
export function performanceStatus(
  value: number | null,
  median: number | null,
  what = 'views'
): Status | null {
  if (value === null || value === undefined || median === null || median === undefined) return null;

  /*
   * A median of zero is a real state, not a missing one. Most Facebook Page
   * posts get no interactions at all, so the median engagement rate there is
   * 0, and bailing out returned "not enough data" for every Facebook row and
   * hid a genuine signal. Against a zero median, anything positive is above
   * it and zero simply matches it.
   */
  if (median <= 0) {
    const l: Level = value > 0 ? 'good' : 'warning';
    return {
      level: l,
      label: PERFORMANCE_LABEL[l],
      shortLabel: PERFORMANCE_SHORT[l],
      reason:
        value > 0
          ? `above your median ${what}, which is zero on this platform`
          : `matches your median ${what}, which is zero on this platform`,
    };
  }

  const ratio = value / median;
  const l: Level = ratio >= 1.3 ? 'good' : ratio >= 0.7 ? 'warning' : 'bad';
  return {
    level: l,
    label: PERFORMANCE_LABEL[l],
    shortLabel: PERFORMANCE_SHORT[l],
    reason: `${Math.round(ratio * 100)}% of your median ${what} (${
      median < 1 ? `${(median * 100).toFixed(1)}%` : Math.round(median).toLocaleString()
    }), on this platform`,
  };
}

/** Engagement per view. Absolute thresholds, used for platform level checks. */
export function engagementStatus(engagement: number | null, views: number | null): Status | null {
  if (!views || views < THRESHOLDS.minSampleViews) return null;
  const rate = (engagement ?? 0) / views;
  const l = level(rate, THRESHOLDS.engagementRate.good, THRESHOLDS.engagementRate.warning);
  return {
    level: l,
    label: LEVEL_LABEL[l],
    shortLabel: LEVEL_SHORT[l],
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
    shortLabel: LEVEL_SHORT[l],
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
    shortLabel: LEVEL_SHORT[l],
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
    shortLabel: LEVEL_SHORT[l],
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
    shortLabel: LEVEL_SHORT[l],
    reason: `${value} new followers over ${days} days`,
  };
}
