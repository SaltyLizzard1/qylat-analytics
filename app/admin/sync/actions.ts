'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

export type SyncState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'done'; which: string; summary: string; warnings: string[] };

/**
 * Runs a sync on demand from the admin screen.
 *
 * Calls the same cron endpoint the scheduler hits, from the server, so the
 * CRON_SECRET stays server side and the browser never sees it. One code path
 * for both the manual run and the 08:00 job means a manual run genuinely
 * proves the scheduled one works.
 */
export async function runSync(_prev: SyncState, formData: FormData): Promise<SyncState> {
  const which = (formData.get('which') as string) === 'ga' ? 'ga' : 'meta';
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return {
      status: 'error',
      message: 'CRON_SECRET is not set on this deployment, so the sync endpoint cannot be called.',
    };
  }

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') || host?.startsWith('127.') ? 'http' : 'https');
  if (!host) return { status: 'error', message: 'Could not work out this deployment’s own address.' };

  const path = which === 'ga' ? '/api/sync/ga?days=14' : '/api/sync/meta?days=7';

  let body: Record<string, unknown>;
  try {
    const res = await fetch(`${proto}://${host}${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    body = (await res.json()) as Record<string, unknown>;
    if (!res.ok && !body) {
      return { status: 'error', message: `Sync endpoint returned HTTP ${res.status}.` };
    }
  } catch (e) {
    return {
      status: 'error',
      message: `Could not reach the sync endpoint: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (body.error) {
    return { status: 'error', message: String(body.error) };
  }

  const warnings: string[] = [];
  let summary: string;

  if (which === 'ga') {
    const errs = (body.errors as unknown[]) ?? [];
    summary = `${body.written ?? 0} rows written, ${body.matchedLinks ?? 0} matched a /go/ link.`;
    if (errs.length) warnings.push(`${errs.length} rows failed to write.`);
  } else {
    const fb = body.facebook as Record<string, unknown> | undefined;
    const ig = body.instagram as Record<string, unknown> | undefined;
    const aud = body.audience as Record<string, unknown> | undefined;
    const part = (label: string, p?: Record<string, unknown>) => {
      if (!p) return `${label} did not run`;
      if (p.failed) return `${label} failed`;
      return `${label} ${p.fetched ?? 0}`;
    };
    summary = `${part('Facebook', fb)}, ${part('Instagram', ig)}, ${aud?.written ?? 0} follower counts.`;

    for (const [label, p] of [['Facebook', fb], ['Instagram', ig]] as const) {
      if (p?.failed) warnings.push(`${label}: ${String(p.failed)}`);
      const errs = (p?.errors as { reason: string }[]) ?? [];
      const unique = [...new Set(errs.map((e) => e.reason))];
      for (const u of unique.slice(0, 3)) warnings.push(`${label}: ${u}`);
      const refused = (p?.metricsUnavailable as { metric: string }[]) ?? [];
      if (refused.length) {
        warnings.push(`${label}: Meta refused ${[...new Set(refused.map((r) => r.metric))].join(', ')}`);
      }
    }
    const audErrs = (aud?.errors as { reason: string }[]) ?? [];
    for (const e of audErrs) warnings.push(`Followers: ${e.reason}`);
  }

  /*
   * Every view reads the database directly, so refresh the lot.
   *
   * Deliberately NOT /admin/sync itself. Revalidating the path the form lives
   * on remounts the component tree and throws away the useActionState result,
   * so the run succeeded and the page silently showed nothing. The counts on
   * this page catch up on the next visit; the report of what just happened
   * matters more than they do.
   */
  for (const p of [
    '/dashboard',
    '/dashboard/leaderboard',
    '/dashboard/platforms',
    '/dashboard/formats',
    '/dashboard/themes',
    '/dashboard/ctas',
    '/dashboard/audience',
    '/dashboard/growth',
    '/dashboard/funnel',
    '/admin/posts',
  ]) {
    revalidatePath(p);
  }

  return { status: 'done', which: which === 'ga' ? 'Google Analytics' : 'Meta', summary, warnings };
}
