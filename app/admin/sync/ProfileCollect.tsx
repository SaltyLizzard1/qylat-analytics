import { EXIT_MEANING, PENDING_EXPIRES_MIN, latestRunRequest, type RunRequest } from '@/lib/profile-runs';
import { shortDateTime } from '@/lib/theme';
import { ProfileCollectButton, type RunView } from './ProfileCollectButton';

/**
 * The personal Facebook profile, beside the Meta and GA buttons.
 *
 * Unlike those two, this cannot run here: the scraper needs the logged in
 * Chrome profile on the laptop. The button leaves a request and opens the
 * collector on the laptop, which claims the request, runs, and reports the
 * result that shows here. Nothing on the laptop runs between presses.
 */
export async function ProfileCollect() {
  let latest: RunRequest | null;
  try {
    latest = await latestRunRequest();
  } catch (e) {
    return (
      <ProfileCollectButton
        view={{
          tone: 'bad',
          open: false,
          launch: false,
          headline: 'Profile requests could not be read.',
          lines: [`Migration 011 may not have been run on this database. ${e instanceof Error ? e.message : String(e)}`],
          afterSessionFailure: false,
        }}
      />
    );
  }
  return <ProfileCollectButton view={describe(latest)} />;
}

function describe(r: RunRequest | null): RunView {
  const base = { open: false, launch: false, afterSessionFailure: false, lines: [] as string[] };
  if (!r) return { ...base, tone: 'none', headline: 'Never requested from here.' };

  const detail = (r.detail ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(-4);

  switch (r.state) {
    case 'pending': {
      const by = new Date(new Date(r.requested_at).getTime() + PENDING_EXPIRES_MIN * 60_000);
      return {
        ...base,
        open: true,
        launch: true,
        tone: 'none',
        headline: `Requested ${shortDateTime(r.requested_at)}. Opening the collector on this laptop.`,
        lines: [
          'Chrome asks before it opens the collector. Allow it.',
          `This only works on the laptop where the collector is set up. If it has not started by ${shortDateTime(by)}, the request is withdrawn and nothing runs.`,
        ],
      };
    }
    case 'running':
      return {
        ...base,
        open: true,
        tone: 'none',
        headline: `Running on the laptop since ${shortDateTime(r.claimed_at)}.`,
        lines: ['A run takes a few minutes. Do not click in the Chrome window while it works.'],
      };
    case 'expired':
      return r.claimed_at
        ? {
            ...base,
            tone: 'warning',
            headline: `No result. The run started ${shortDateTime(r.claimed_at)} and never reported back.`,
            lines: ['Check scrape.log on the laptop for what happened.'],
          }
        : {
            ...base,
            tone: 'warning',
            headline: `Not started. Requested ${shortDateTime(r.requested_at)}, withdrawn after ${PENDING_EXPIRES_MIN} minutes.`,
            lines: ['The collector did not start. It opens only on the laptop where register-protocol.ps1 has been run.'],
          };
    case 'finished': {
      const code = r.exit_code ?? 1;
      const meaning = EXIT_MEANING[code] ?? `Exit code ${code}.`;
      return code === 0
        ? { ...base, tone: 'good', headline: `Collected ${shortDateTime(r.finished_at)}.`, lines: detail, link: true }
        : {
            ...base,
            tone: 'bad',
            headline: `Failed ${shortDateTime(r.finished_at)}, exit code ${code}. ${meaning}`,
            lines: detail,
            afterSessionFailure: code === 5,
          };
    }
  }
}
