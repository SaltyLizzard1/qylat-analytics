/**
 * What to say beside an Instagram-only views figure when the post is linked
 * to a Facebook copy.
 *
 * Pure, with no imports that run, so it is the same on the server and in a
 * test. The sum itself is made by totalOf in lib/combined.ts. This only
 * decides what that sum may be called:
 *
 *   combined  every linked copy's views are in the sum
 *   partial   at least one Facebook copy is in the sum, and at least one
 *             linked copy is not, either with no figure or with a figure
 *             whose scope was never confirmed
 *   none      no Facebook copy's views could be added, so there is no sum to
 *             show and the Instagram figure is not dressed up as one
 */
import type { Total } from './combined';

export type ScopeNote = {
  kind: 'combined' | 'partial' | 'none';
  /** The sum to show. Null when kind is 'none'. */
  value: number | null;
  /** Accounts whose views are in the sum, in the dashboard's account order. */
  included: string[];
  /** Why a linked copy is not in the sum, one entry per account. */
  gaps: { platform: string; reason: 'no-figure' | 'scope-unconfirmed' }[];
};

export function scopeNote(total: Pick<Total, 'value' | 'included' | 'missing' | 'apart'>): ScopeNote {
  const gaps: ScopeNote['gaps'] = [
    ...total.missing.map((platform) => ({ platform, reason: 'no-figure' as const })),
    ...total.apart.map((platform) => ({ platform, reason: 'scope-unconfirmed' as const })),
  ];
  const facebookAdded = total.included.some((p) => p !== 'instagram');
  if (total.value === null || !facebookAdded) return { kind: 'none', value: null, included: [], gaps };
  return { kind: gaps.length === 0 ? 'combined' : 'partial', value: total.value, included: [...total.included], gaps };
}
