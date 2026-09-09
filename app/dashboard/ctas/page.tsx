import { getCtaPerformance } from '@/lib/queries';
import { BarList, Panel, Note, type BarDatum } from '@/components/charts';
import { C } from '@/lib/theme';

export const dynamic = 'force-dynamic';

const CTA_LABEL: Record<string, string> = {
  'leap-log': 'Leap Log',
  quiz: 'Readiness Quiz',
  'leap-kit': '60-Day Leap Kit',
  other: 'Other',
  unset: 'No CTA set',
};

export default async function CtasPage() {
  const rows = await getCtaPerformance();

  const bars: BarDatum[] = rows.map((r) => ({
    key: r.cta_type as string,
    label: CTA_LABEL[r.cta_type as string] ?? (r.cta_type as string),
    value: (r.clicks as number) ?? 0,
    meta: `${r.links} links`,
  }));

  const distinctCtas = rows.filter((r) => r.cta_type !== 'unset').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl mb-1" style={{ fontWeight: 600, color: C.text }}>
          CTA Destination
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          Which call to action people actually click, measured from your own redirect log rather
          than from any platform.
        </p>
      </div>

      <Panel title="Clicks by CTA">
        <BarList data={bars} valueLabel="Clicks" emptyMessage="No /go/ links created yet." />

        {distinctCtas <= 1 && rows.length > 0 && (
          <Note>
            Every link you have made so far points at the same CTA, so there is nothing to compare
            yet. This view becomes useful once you have run at least two different CTAs. Set the CTA
            when creating a link.
          </Note>
        )}
      </Panel>

      <Panel title="The numbers">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th
                  className="text-left text-xs uppercase tracking-widest font-normal px-2 py-2"
                  style={{ color: C.muted }}
                >
                  CTA
                </th>
                {['Links', 'Clicks', 'Clicks per link'].map((h) => (
                  <th
                    key={h}
                    className="text-right text-xs uppercase tracking-widest font-normal px-2 py-2"
                    style={{ color: C.muted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const links = (r.links as number) ?? 0;
                const clicks = (r.clicks as number) ?? 0;
                return (
                  <tr
                    key={r.cta_type as string}
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      background: i % 2 === 1 ? C.neutral : C.card,
                    }}
                  >
                    <td className="px-2 py-2.5" style={{ color: C.text }}>
                      {CTA_LABEL[r.cta_type as string] ?? (r.cta_type as string)}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: C.text }}>
                      {links}
                    </td>
                    <td
                      className="px-2 py-2.5 text-right tabular-nums"
                      style={{ color: C.text, fontWeight: 600 }}
                    >
                      {clicks}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: C.text }}>
                      {links > 0 ? (clicks / links).toFixed(1) : '--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
