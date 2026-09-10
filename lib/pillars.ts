/**
 * QYLAT content tags, used as the content theme vocabulary.
 *
 * Set by Liz on 2026-09-10, replacing the four pillars from the qylat-social
 * skill because those did not fit her content specifically. Mechanics was
 * added so the practical, searchable how-to posts (visas, licences, banking,
 * housing) keep their own bucket rather than being absorbed into everyday life
 * in Thailand.
 *
 * The skill still lists its own four pillars, so the two now differ. Update
 * the skill if these are meant to be the content strategy as well as the
 * tagging vocabulary.
 *
 * `targetShare` is optional and currently unset. With no targets the mix panel
 * reports the distribution and makes no judgement, which is honest. Supply
 * numbers that sum to 1 and it starts comparing published against intended.
 *
 * A controlled vocabulary is the whole point. Sixty-nine posts carrying
 * sixty-nine themes tells you nothing, because every row is a sample of one.
 * Five tags over sixty-nine posts is a comparison.
 */

export type Pillar = {
  slug: string;
  label: string;
  /** Intended share of output, as a fraction. Optional. */
  targetShare?: number;
  /** What belongs here, to settle borderline posts the same way twice. */
  covers: string;
};

export const PILLARS: Pillar[] = [
  {
    slug: 'life-in-thailand',
    label: 'Life in Thailand',
    covers:
      'Chiang Mai and everyday Thailand: food, the market, cost of living, an ordinary Tuesday. Settled life.',
  },
  {
    slug: 'life-traveling',
    label: 'Life traveling',
    covers: 'Being on the move rather than settled: trips, Phi Phi, the road to Pai, elsewhere.',
  },
  {
    slug: 'mechanics',
    label: 'Mechanics',
    covers:
      'How the leap actually works: visas, licences, banking, housing, what she sold and kept. Practical and searchable.',
  },
  {
    slug: 'inspirational',
    label: 'Inspirational',
    covers: 'Fear, doubt, deciding, the rebuilding years. The posts meant to move someone.',
  },
  {
    slug: 'promotional',
    label: 'Promotional',
    covers: 'The quiz, the Leap Log, the Leap Kit, IdeaToPlan. Anything asking for a click.',
  },
];

export const PILLAR_SLUGS = PILLARS.map((p) => p.slug);

/** True when any tag carries a target, which is what turns on the comparison. */
export const HAS_TARGETS = PILLARS.some((p) => typeof p.targetShare === 'number');

export function pillarLabel(slug: string | null | undefined): string {
  if (!slug) return 'Untagged';
  return PILLARS.find((p) => p.slug === slug)?.label ?? slug;
}

export function isPillar(slug: string | null | undefined): boolean {
  return !!slug && PILLAR_SLUGS.includes(slug);
}
