import {
  getLinkFunnel,
  getPlatformFunnel,
  getUnmatchedTraffic,
  getGaStatus,
} from '@/lib/queries';
import { BarList, Panel, Empty, Note, StatTile, type BarDatum } from '@/components/charts';
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

  const withClicks = links.filter((r) => (r.clicks as number) > 0 || (r.sessions as number) > 0);

  const totalClicks = links.reduce((n, r) => n + ((r.clicks as number) ?? 0), 0);
  const totalSessions = links.reduce((n, r) => n + ((r.sessions as number) ?? 0), 0);
  const totalEngaged = links.reduce((n, r) => n + ((r.engaged as number) ?? 0), 0);

  const clickBars: BarDatum[] = withClicks.map((r) => ({
    key: `c-${r.slug}`,
    label: r.slug as string,
    value: (r.clicks as number) ?? 0,
    meta: platformLabel(r.platform as string),
  }));

  const sessionBars: BarDatum[] = withClicks.map((r) => ({
    key: `s-${r.slug}`,
    label: r.slug as string,
    value: (r.sessions as number) ?? 0,
    meta: platformLabel(r.platform as string),
  }));

  return (
    <div className="space-y-5">
      <Header />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Clicks" value={compact(totalClicks)} sub="your redirect log" />
        <StatTile label="Sessions" value={compact(totalSessions)} sub="Google Analytics" />
        <StatTile
          label="Arrived"
          value={pct(totalSessions, totalClicks)}
          sub="sessions per click"
        />
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

      <Panel title="The numbers" description="Every link, clicks through to engaged sessions.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <Th>Link</Th>
                <Th>Platform</Th>
                <Th right>Clicks</Th>
                <Th right>Sessions</Th>
                <Th right>Arrived</Th>
                <Th right>Engaged</Th>
              </tr>
            </thead>
            <tbody>
              {links.map((r, i) => {
                const clicks = (r.clicks as number) ?? 0;
                const sessions = (r.sessions as number) ?? 0;
                return (
                  <tr
                    key={r.slug as string}
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      background: i % 2 === 1 ? C.neutral : C.card,
                    }}
                  >
                    <Td>
                      <code style={{ color: C.text }}>{r.slug as string}</code>
                    </Td>
                    <Td>
                      <span className="text-xs" style={{ color: C.muted }}>
                        {platformLabel(r.platform as string)}
                      </span>
                    </Td>
                    <Td right>{clicks}</Td>
                    <Td right bold>
                      {sessions}
                    </Td>
                    <Td right>{clicks > 0 ? pct(sessions, clicks) : '--'}</Td>
                    <Td right>{(r.engaged as number) ?? 0}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="By platform">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <Th>Platform</Th>
                <Th right>Clicks</Th>
                <Th right>Sessions</Th>
                <Th right>Arrived</Th>
                <Th right>Engaged</Th>
              </tr>
            </thead>
            <tbody>
              {platforms.map((r, i) => (
                <tr
                  key={r.platform as string}
                  style={{
                    borderBottom: `1px solid ${C.border}`,
                    background: i % 2 === 1 ? C.neutral : C.card,
                  }}
                >
                  <Td>{platformLabel(r.platform as string)}</Td>
                  <Td right>{(r.clicks as number) ?? 0}</Td>
                  <Td right bold>
                    {(r.sessions as number) ?? 0}
                  </Td>
                  <Td right>{pct(r.sessions as number, r.clicks as number)}</Td>
                  <Td right>{(r.engaged as number) ?? 0}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Traffic not coming through a /go/ link"
        description="Sessions whose utm_content matches no link you created, including everything untagged."
      >
        {unmatched.length === 0 ? (
          <Empty message="All recorded sessions match a link." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <Th>Source</Th>
                  <Th>Medium</Th>
                  <Th>utm_content</Th>
                  <Th right>Sessions</Th>
                  <Th right>Engaged</Th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((r, i) => (
                  <tr
                    key={`${r.source}-${r.medium}-${r.content}-${i}`}
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      background: i % 2 === 1 ? C.neutral : C.card,
                    }}
                  >
                    <Td>{r.source as string}</Td>
                    <Td>
                      <span className="text-xs" style={{ color: C.muted }}>
                        {r.medium as string}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs" style={{ color: C.muted }}>
                        {r.content as string}
                      </span>
                    </Td>
                    <Td right bold>
                      {(r.sessions as number) ?? 0}
                    </Td>
                    <Td right>{(r.engaged as number) ?? 0}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    <div>
      <h1 className="text-2xl mb-1" style={{ fontWeight: 600, color: C.text }}>
        Funnel
      </h1>
      <p className="text-sm" style={{ color: C.muted }}>
        What happened after the click. Your redirect log says someone left the platform, Google
        Analytics says whether they actually arrived and stayed.
      </p>
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className="text-xs uppercase tracking-widest font-normal px-2 py-2"
      style={{ color: C.muted, textAlign: right ? 'right' : 'left' }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right = false,
  bold = false,
}: {
  children: React.ReactNode;
  right?: boolean;
  bold?: boolean;
}) {
  return (
    <td
      className="px-2 py-2.5 tabular-nums"
      style={{ textAlign: right ? 'right' : 'left', color: C.text, fontWeight: bold ? 600 : 400 }}
    >
      {children}
    </td>
  );
}
