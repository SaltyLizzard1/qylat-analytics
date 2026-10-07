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
  good: 'High',
  warning: 'Medium',
  bad: 'Low',
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

  /** A format's views as a ratio of its platform's benchmark. */
  formatVsPlatform: { good: 1.0, warning: 0.6 },

  /**
   * Age at which the overview compares formats, in hours. 72 rather than 24
   * because the daily sync samples once a day, and at 24 hours a post caught
   * one hour after publishing sits beside one caught at 23.
   */
  formatAgeHours: 72,
  /**
   * A reading this many hours older than the newest reading for the same
   * content is flagged as stale on the Content page. Provisional: the API
   * and the collector each read about once a day, so two days apart is more
   * than a normal gap between them.
   */
  staleReadHours: 48,

  /**
   * How far apart two copies with an identical complete caption may be
   * published and still be linked automatically. Chosen from production on
   * 7 Oct 2026: of 23 identical-caption pairs across accounts, most were
   * published in the same minute, and the widest real gap was 13 hours 11
   * minutes (one account in the morning, the others that evening). 24 hours
   * covers that with room and stays inside a day. The reasoning is in
   * lib/automatch.ts.
   */
  autoLinkToleranceHours: 24,
  /** A caption shorter than this identifies nothing and is never linked automatically. */
  autoLinkMinCaption: 20,
  /**
   * Linked Instagram and Page posts published within this many days are
   * re-read by the daily sync even when they are older than its own window,
   * so a combined total does not rest on a reading from the post's first
   * week. Matches the default period the dashboard opens on.
   */
  linkedRefreshDays: 30,
  /**
   * At most this many linked posts per account are re-read in one sync,
   * least recently read first. The sync has 60 seconds on this plan and each
   * post costs one or two Graph API calls.
   */
  linkedRefreshMax: 10,

  /**
   * Cover photo and profile picture changes that Facebook returned as posts.
   * Any at all is worth a look, since one could be a real post that lost its
   * caption.
   */
  pageUpdates: { warning: 1 },

  /** Days a link can sit with zero clicks before it is worth asking why. */
  idleLinkDays: { warning: 14, bad: 30 },

  /** Share of synced posts still missing a content theme. */
  untaggedShare: { warning: 0.25, bad: 0.75 },

  /** New followers over the recorded window. */
  followerGrowth: { good: 30, warning: 10 },

  /**
   * Period over period fall in clicks, sessions or followers. A 20% fall is
   * worth a look, a 40% fall is worth acting on. A rise never alerts.
   */
  trendDrop: { warning: 0.2, bad: 0.4 },

  /** Minimum count in the previous window before a movement is called a trend. */
  minSampleTrend: 5,

  /**
   * PROVISIONAL sample-size rule, not a validated benchmark.
   *
   * Below this many events, a finding is never raised above "needs attention".
   * Five clicks falling to two is a 60% drop and is also three clicks. It is
   * worth a look and is not an emergency, so the alert says the sample is
   * small instead of shouting.
   *
   * 20 was chosen by judgement on 2026-10-04, not derived from this account's
   * data or from any published standard. It says nothing about what good
   * performance is. It only decides how loudly a small count may speak. Revisit
   * it once there is enough history to see how often small windows mislead.
   */
  minSampleUrgent: 20,

  /**
   * PROVISIONAL sample-size rule, not a validated benchmark. The same idea for
   * posts: a format judged on three posts can be one post away from a
   * different verdict, so below this it is held at "needs attention" and says
   * the sample is small. 8 was chosen by judgement, like the 20 above.
   */
  minSamplePostsUrgent: 8,

  /**
   * A platform median below this is treated as no baseline at all. Facebook's
   * median engagement rate is 0.0%, and judging posts against nothing made
   * 0.5% read as High.
   */
  minMedianRate: 0.01,

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

/** A finding built on a small count is held at "needs attention". A provisional rule: see minSampleUrgent. */
function capSmall(l: Level, small: boolean): Level {
  return small && l === 'bad' ? 'warning' : l;
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
  const small = clicks < THRESHOLDS.minSampleUrgent;
  const l = capSmall(level(rate, THRESHOLDS.arrivalRate.good, THRESHOLDS.arrivalRate.warning), small);
  return {
    level: l,
    label: LEVEL_LABEL[l],
    shortLabel: LEVEL_SHORT[l],
    reason: `${sessions ?? 0} of ${clicks} clicks became a session (${fmtPct(rate)})${small ? '. Small sample' : ''}`,
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
   * A degenerate median is not a baseline, it is an absence, and comparing
   * against it produces nonsense: Facebook's median engagement rate is 0.0%,
   * so a post at 0.5% scored "High" while an Instagram post at 4.7% scored
   * "Medium" against a 4.9% median. Read side by side that is absurd, and the
   * badge is the thing at fault, not the numbers.
   *
   * Below the floor there is nothing meaningful to compare to, so say so
   * rather than inventing a verdict. Same principle as the minimum sample:
   * no baseline is no answer, not a good one.
   */
  if (median < THRESHOLDS.minMedianRate) return null;

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
    reason: `${(engagement ?? 0).toLocaleString()} engagements on ${views.toLocaleString()} views (${(
      rate * 100
    ).toFixed(1)}%)`,
  };
}

/**
 * A format measured against its own platform's benchmark. `basis` names the
 * benchmark in the reason, since the format page uses lifetime averages and
 * the overview uses medians at the same age, and the sentence must say which.
 */
export function formatStatus(
  views: number | null,
  platformBenchmark: number | null,
  posts: number | null,
  basis = 'the platform average'
): Status | null {
  if (!platformBenchmark || !posts || posts < THRESHOLDS.minSamplePosts) return null;
  const ratio = (views ?? 0) / platformBenchmark;
  const small = posts < THRESHOLDS.minSamplePostsUrgent;
  const l = capSmall(level(ratio, THRESHOLDS.formatVsPlatform.good, THRESHOLDS.formatVsPlatform.warning), small);
  return {
    level: l,
    label: LEVEL_LABEL[l],
    shortLabel: LEVEL_SHORT[l],
    reason: `${Math.round(views ?? 0).toLocaleString()} views against ${Math.round(
      platformBenchmark
    ).toLocaleString()}, ${fmtPct(ratio)} of ${basis}, over ${posts} posts${small ? '. Small sample' : ''}`,
  };
}

/**
 * Facebook rows that are cover photo or profile picture changes, not posts.
 * `breakdown` is the count per reason, e.g. "3 cover photo, 1 profile picture".
 */
export function pageUpdateStatus(count: number, breakdown: string): Status | null {
  if (count < THRESHOLDS.pageUpdates.warning) return null;
  return {
    level: 'warning',
    label: LEVEL_LABEL.warning,
    shortLabel: LEVEL_SHORT.warning,
    reason: `Facebook returned them through the posts edge: ${breakdown}`,
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

/** Change from previous to current as a fraction, or null when there is no base to measure from. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

/**
 * Period over period movement of an event count: clicks, sessions, followers.
 *
 * Only a fall alerts, and only against a previous window large enough that a
 * swing of one or two events is not a trend. ACTION wording, because a drop
 * this period is still something to act on. `against` names the previous
 * window, since "down 30%" means nothing without saying against what.
 */
export function trendStatus(
  current: number,
  previous: number,
  what: string,
  against: string
): Status | null {
  if (previous < THRESHOLDS.minSampleTrend) return null;
  const change = pctChange(current, previous);
  if (change === null) return null;
  const drop = -change;
  const small = previous < THRESHOLDS.minSampleUrgent;
  const l: Level = capSmall(
    drop >= THRESHOLDS.trendDrop.bad ? 'bad' : drop >= THRESHOLDS.trendDrop.warning ? 'warning' : 'good',
    small
  );
  const movement =
    Math.abs(change) < 0.005 ? 'level' : `${change < 0 ? 'down' : 'up'} ${fmtPct(Math.abs(change))}`;
  // The counts lead and the percentage follows, so 2 against 5 reads as what
  // it is before it reads as 60%.
  return {
    level: l,
    label: LEVEL_LABEL[l],
    shortLabel: LEVEL_SHORT[l],
    reason: `${what}: ${current.toLocaleString()} against ${previous.toLocaleString()} in ${against} (${movement})${
      small ? '. Small sample' : ''
    }`,
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
