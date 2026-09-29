import { getCtaPerformance } from '@/lib/queries';
import { parsePeriod, periodPhrase } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { BarList, Panel, Note, PageHeader, Disclosure, type BarDatum } from '@/components/charts';
import { DataRows, Sub, type Column } from '@/components/DataRows';
import type { Row } from '@/lib/queries';
import { full } from '@/lib/theme';

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

export default async function CtasPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compare?: string }>;
}) {
  const period = parsePeriod(await searchParams);
  const rows = await getCtaPerformance(period);

  const bars: BarDatum[] = rows.map((r) => ({
    key: r.cta_type as string,
    label: label(r.cta_type as string),
    value: (r.clicks as number) ?? 0,
    meta: `${r.links} links`,
  }));

  const distinctCtas = rows.filter((r) => r.cta_type !== 'unset').length;
  const totalLinks = rows.reduce((n, r) => n + ((r.links as number) ?? 0), 0);
  const totalClicks = rows.reduce((n, r) => n + ((r.clicks as number) ?? 0), 0);

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
        meta={[
          { label: 'CTAs in use', value: String(distinctCtas) },
          { label: 'Links', value: String(totalLinks) },
          { label: 'Clicks', value: full(totalClicks) },
        ]}
      />

      <Disclosure summary="What this page measures">
        Which call to action people actually click, counted from your own redirect log rather than
        from any platform. A link carries its CTA from the moment you create it, so this works
        whether or not the post behind it was ever tagged.
      </Disclosure>

      <PeriodPicker period={period} />

      <Panel title="Clicks by CTA" description={`Clicks that happened ${periodPhrase(period)}.`}>
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
