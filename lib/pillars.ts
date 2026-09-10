/**
 * QYLAT content pillars, used as the content theme vocabulary.
 *
 * These are not invented for the dashboard. They are the pillars defined in
 * the qylat-social skill, with the target share of output attached, so the
 * Themes view can compare what actually got published against what was
 * intended rather than only reporting performance.
 *
 * A controlled vocabulary is the whole point. Sixty-nine posts carrying
 * sixty-nine different themes tells you nothing, because every row is a sample
 * of one. Four themes over sixty-nine posts is a comparison.
 *
 * `targetShare` is a guide, not a rule. The skill says so: if Liz wants to
 * lean on one pillar for a while, the target is what moves, not the content.
 */

export type Pillar = {
  slug: string;
  label: string;
  /** Intended share of output, as a fraction. */
  targetShare: number;
  /** What belongs here, to settle the borderline cases while tagging. */
  covers: string;
};

export const PILLARS: Pillar[] = [
  {
    slug: 'chiang-mai-life',
    label: 'Life in Chiang Mai',
    targetShare: 0.4,
    covers: 'Day trips, food, cost of living, an ordinary Tuesday. Highest reach, lowest effort.',
  },
  {
    slug: 'how-the-leap-works',
    label: 'How the leap works',
    targetShare: 0.25,
    covers: 'Visas, licences, banking, housing, what she sold and kept. Practical and searchable.',
  },
  {
    slug: 'mindset-shift',
    label: 'The mindset shift',
    targetShare: 0.2,
    covers: 'Fear, doubt, the moment of deciding, what the six rebuilding years taught her.',
  },
  {
    slug: 'what-im-building',
    label: 'What I am building',
    targetShare: 0.15,
    covers: 'Running a business from a laptop abroad, the tool, the workflow.',
  },
];

export const PILLAR_SLUGS = PILLARS.map((p) => p.slug);

export function pillarLabel(slug: string | null | undefined): string {
  if (!slug) return 'Untagged';
  return PILLARS.find((p) => p.slug === slug)?.label ?? slug;
}

export function isPillar(slug: string | null | undefined): boolean {
  return !!slug && PILLAR_SLUGS.includes(slug);
}
