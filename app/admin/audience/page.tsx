import { getManualAudienceEntries, getLatestAudience, AUDIENCE_PLATFORMS } from '@/lib/queries';
import { AudienceForm, DeleteEntryButton } from './AudienceForm';
import { C, compact, shortDate } from '@/lib/theme';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook Page',
  'facebook-personal': 'Facebook personal',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

export default async function AudienceAdminPage() {
  const [entries, latest] = await Promise.all([getManualAudienceEntries(), getLatestAudience()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl mb-1" style={{ fontWeight: 600, color: C.text }}>
          Audience entry
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          For accounts no API can read. Your personal Facebook profile is the main one: Meta exposes
          nothing for personal profiles, so a number you type here is the only way it ever appears in
          the dashboard.
        </p>
        <p className="text-sm mt-2" style={{ color: C.muted }}>
          Entries are marked manual and the Meta sync will not overwrite them. Instagram and the
          Facebook Page are recorded automatically each day, so you only need those here if you want
          to correct a figure.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <h2 className="text-base mb-4" style={{ fontWeight: 600, color: C.text }}>
            Add or update a figure
          </h2>
          <AudienceForm options={[...AUDIENCE_PLATFORMS]} today={today} />
        </div>

        <div className="rounded-lg p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <h2 className="text-base mb-4" style={{ fontWeight: 600, color: C.text }}>
            Latest per account
          </h2>
          {latest.length === 0 ? (
            <p className="text-sm" style={{ color: C.muted }}>
              Nothing recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {latest.map((r) => (
                <div
                  key={r.platform as string}
                  className="flex items-baseline justify-between text-sm py-1.5"
                  style={{ borderBottom: `1px solid ${C.border}` }}
                >
                  <span style={{ color: C.text }}>{LABEL[r.platform as string] ?? (r.platform as string)}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-xs" style={{ color: C.muted }}>
                      {r.source === 'manual' ? 'manual' : 'api'} · {shortDate(r.recorded_on as string)}
                    </span>
                    <span className="tabular-nums" style={{ fontWeight: 600, color: C.text }}>
                      {compact(r.followers as number)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-base mb-3" style={{ fontWeight: 600, color: C.text }}>
          Manual entries
        </h2>
        {entries.length === 0 ? (
          <div
            className="text-center py-10 rounded-lg text-sm"
            style={{ background: C.neutral, border: `1px dashed ${C.border}`, color: C.muted }}
          >
            No manual entries yet. Add your personal Facebook follower count above to start a series.
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div
                key={e.id as number}
                className="rounded-lg px-4 py-2.5 flex items-center justify-between text-sm"
                style={{ background: C.card, border: `1px solid ${C.border}` }}
              >
                <span style={{ color: C.text }}>
                  {LABEL[e.platform as string] ?? (e.platform as string)}
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-xs" style={{ color: C.muted }}>
                    {shortDate(e.recorded_on as string)}
                  </span>
                  <span className="tabular-nums" style={{ fontWeight: 600, color: C.text }}>
                    {compact(e.followers as number)}
                  </span>
                  <DeleteEntryButton id={e.id as number} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
