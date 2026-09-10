import { getCtaPerformance } from '@/lib/queries';
import { BarList, Panel, Note, PageHeader, type BarDatum } from '@/components/charts';
import { DataRows, Sub, type Column } from '@/components/DataRows';
import type { Row } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const CTA_LABEL: Record<string, string> = {
  'leap-log': 'Leap Log',
  quiz: 'Readiness Quiz',
  'leap-kit': '60-Day Leap Kit',
  other: 'Other',
  unset: 'No CTA set',
};

function label(value: string): string {
  return CTA_LABEL[value] ?? value;
}

export default async function CtasPage() {
  const rows = await getCtaPerformance();

  const bars: BarDatum[] = rows.map((r) => ({
    key: r.cta_type as string,
    label: label(r.cta_type as string),
    value: (r.clicks as number) ?? 0,
    meta: `${r.links} links`,
  }));

  const distinctCtas = rows.filter((r) => r.cta_type !== 'unset').length;

  const columns: Column<Row>[] = [
    {
      key: 'cta',
      label: 'CTA',
      width: 'minmax(9rem, 1.6fr)',
      render: (r) => label(r.cta_type as string),
    },
    { key: 'links', label: 'Links', align: 'right', width: '4.5rem', render: (r) => (r.links as number) ?? 0 },
    {
      key: 'clicks',
      label: 'Clicks',
      align: 'right',
      width: '5rem',
      bold: true,
      render: (r) => (r.clicks as number) ?? 0,
    },
    {
      key: 'per',
      label: 'Clicks per link',
      align: 'right',
      width: '8rem',
      render: (r) => {
        const links = (r.links as number) ?? 0;
        const clicks = (r.clicks as number) ?? 0;
        return links > 0 ? (clicks / links).toFixed(1) : <Sub>--</Sub>;
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="CTA Destination"
        lead="Which call to action people actually click, measured from your own redirect log rather than from any platform."
      />

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
        <DataRows
          columns={columns}
          rows={rows}
          keyOf={(r) => r.cta_type as string}
          emptyMessage="No /go/ links created yet."
        />
      </Panel>
    </div>
  );
}
