import {
  getLinkFunnel,
  getPlatformFunnel,
  getUnmatchedTraffic,
  getGaStatus,
  type Row,
} from '@/lib/queries';
import { BarList, Panel, Empty, Note, StatTile, PageHeader, type BarDatum } from '@/components/charts';
import { DataRows, Chip, Sub, type Column } from '@/components/DataRows';
import { StatusBadge, StatusLegend } from '@/components/status';
import { arrivalStatus } from '@/lib/status';
import { C, compact, pct, platformLabel } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function FunnelPage() {
  const [links, platforms, unmatched, status] = await Promise.all([
    getLinkFunnel(),
    getPlatformFunnel(),
    getUnmatchedTraffic(),
    getGaStatus(),
  ]);

  if (status.rows === 0) {
    return (
      <div className="space-y-5">
        <Header />
        <Panel title="No Google Analytics data yet">
          <Empty message="Run the GA sync once and this fills in. It needs GA_PROPERTY_ID and GA_SERVICE_ACCOUNT_B64 set in Vercel." />
        </Panel>
      </div>
    );
  }

  const withActivity = links.filter((r) => (r.clicks as number) > 0 || (r.sessions as number) > 0);

  const totalClicks = links.reduce((n, r) => n + ((r.clicks as number) ?? 0), 0);
  const totalSessions = links.reduce((n, r) => n + ((r.sessions as number) ?? 0), 0);
  const totalEngaged = links.reduce((n, r) => n + ((r.engaged as number) ?? 0), 0);

  const clickBars: BarDatum[] = withActivity.map((r) => ({
    key: `c-${r.slug}`,
    label: r.slug as string,
    value: (r.clicks as number) ?? 0,
    meta: platformLabel(r.platform as string),
  }));

  const sessionBars: BarDatum[] = withActivity.map((r) => ({
    key: `s-${r.slug}`,
    label: r.slug as string,
    value: (r.sessions as number) ?? 0,
    meta: platformLabel(r.platform as string),
  }));

  const statusCol: Column<Row> = {
    key: 'status',
    label: 'Status',
    width: '6.5rem',
    render: (r) => (
      <StatusBadge status={arrivalStatus(r.sessions as number, r.clicks as number)} compact />
    ),
  };

  const numeric = (key: string, label: string, width: string, bold = false): Column<Row> => ({
    key,
    label,
    align: 'right',
    width,
    bold,
    render: (r) => (r[key] as number) ?? 0,
  });

  const linkColumns: Column<Row>[] = [
    {
      key: 'slug',
      label: 'Link',
      width: 'minmax(9rem, 1.8fr)',
      render: (r) => (
        <span className="font-mono text-xs truncate block" style={{ color: C.text }}>
          {r.slug as string}
        </span>
      ),
    },
    {
      key: 'platform',
      label: 'Platform',
      width: '6.5rem',
      render: (r) => <Chip>{platformLabel(r.platform as string)}</Chip>,
    },
    numeric('clicks', 'Clicks', '4.5rem'),
    numeric('sessions', 'Sessions', '5.5rem', true),
    {
      key: 'arrived',
      label: 'Arrived',
      align: 'right',
      width: '5rem',
      render: (r) =>
        (r.clicks as number) > 0 ? pct(r.sessions as number, r.clicks as number) : <Sub>--</Sub>,
    },
    numeric('engaged', 'Engaged', '5rem'),
    statusCol,
  ];

  const platformColumns: Column<Row>[] = [
    {
      key: 'platform',
      label: 'Platform',
      width: 'minmax(7rem, 1.4fr)',
      render: (r) => platformLabel(r.platform as string),
    },
    numeric('clicks', 'Clicks', '4.5rem'),
    numeric('sessions', 'Sessions', '5.5rem', true),
    {
      key: 'arrived',
      label: 'Arrived',
      align: 'right',
      width: '5rem',
      render: (r) => pct(r.sessions as number, r.clicks as number),
    },
    numeric('engaged', 'Engaged', '5rem'),
    statusCol,
  ];

  const unmatchedColumns: Column<Row>[] = [
    { key: 'source', label: 'Source', width: 'minmax(8rem, 1.4fr)', render: (r) => r.source as string },
    { key: 'medium', label: 'Medium', width: '7rem', render: (r) => <Sub>{r.medium as string}</Sub> },
    {
      key: 'content',
      label: 'utm_content',
      width: 'minmax(8rem, 1.2fr)',
      render: (r) => <Sub>{r.content as string}</Sub>,
    },
    numeric('sessions', 'Sessions', '5.5rem', true),
    numeric('engaged', 'Engaged', '5rem'),
  ];

  return (
    <div className="space-y-5">
      <Header />
      <StatusLegend />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Clicks" value={compact(totalClicks)} sub="your redirect log" />
        <StatTile label="Sessions" value={compact(totalSessions)} sub="Google Analytics" />
        <StatTile label="Arrived" value={pct(totalSessions, totalClicks)} sub="sessions per click" />
      </div>

      <Panel
        title="Clicks against sessions, per link"
        description="Two charts rather than one. Clicks and sessions are different measurements from different systems, and stacking them on one axis would imply they are the same quantity."
      >
        <BarList data={clickBars} valueLabel="Clicks, from your redirect log" />
        <div className="mt-6">
          <BarList data={sessionBars} valueLabel="Sessions, from Google Analytics" />
        </div>
        <Note>
          Clicks will exceed sessions and that is expected, not a bug. A click is logged the moment
          the redirect is hit. A session needs the browser to load the site and run the GA script,
          which in-app browsers, ad blockers, consent banners and bots all get in the way of. A link
          where sessions exceed clicks is the interesting case: that traffic arrived on your UTM
          without passing through the /go/ redirect.
        </Note>
      </Panel>

      <Panel title="Every link" description="Clicks through to engaged sessions.">
        <DataRows columns={linkColumns} rows={links} keyOf={(r) => r.slug as string} />
      </Panel>

      <Panel title="By platform">
        <DataRows columns={platformColumns} rows={platforms} keyOf={(r) => r.platform as string} />
      </Panel>

      <Panel
        title="Traffic not coming through a /go/ link"
        description="Sessions whose utm_content matches no link you created, including everything untagged."
      >
        <DataRows
          columns={unmatchedColumns}
          rows={unmatched}
          keyOf={(r, i) => `${r.source}-${r.medium}-${r.content}-${i}`}
          emptyMessage="All recorded sessions match a link."
        />
        <Note>
          Most of this is direct and organic traffic, which is fine. Watch for a social referral with
          no utm_content: that is a post you shared without a /go/ link, and it is invisible to every
          other view in this dashboard.
        </Note>
      </Panel>

      {totalEngaged === 0 && totalSessions > 0 && (
        <Note>
          Google Analytics reports no engaged sessions on any tagged link yet. Engagement needs ten
          seconds on the page, two pageviews, or a key event. With this little traffic it may simply
          be a small sample.
        </Note>
      )}
    </div>
  );
}

function Header() {
  return (
    <PageHeader
      title="Funnel"
      lead="What happened after the click. Your redirect log says someone left the platform, Google Analytics says whether they actually arrived and stayed."
    />
  );
}
