import Link from 'next/link';
import { BarList, Note, Panel, StatTile, TrendChart } from '@/components/charts';
import { C, SERIES, full, platformColor, shortDate, shortDateTime } from '@/lib/theme';
import type { Period } from '@/lib/period';
import { trafficLabel } from '@/lib/ytanalytics';
import type { WindowAnalytics } from '@/lib/ytanalytics-store';
import { duration, summarise } from '@/lib/ytanalytics-summary';

/**
 * YouTube Analytics on the Audience page, inside the YouTube section.
 *
 * Everything here is activity inside the chosen window: watch time, views and
 * subscriber changes that happened on those days. It is never a lifetime
 * figure, and it says so. The lifetime view counts per video come from the
 * public import and live on the other pages.
 *
 * A figure YouTube has not returned reads "Not available", never 0. The
 * reporting delay is stated with the date YouTube's data runs to.
 */
const NA = 'Not available';

export function YouTubeAnalytics({ data, period }: { data: WindowAnalytics | null; period: Period }) {
  if (!data || (!data.connection && data.days.length === 0)) {
    return (
      <Panel title="YouTube watch time, subscriber changes and traffic sources" description="Needs YouTube Analytics access, which is not connected.">
        <p className="text-sm" style={{ color: C.muted }}>
          These come from YouTube Analytics, which needs the channel owner’s read-only permission.{' '}
          <Link href="/admin/youtube" style={{ color: C.text, textDecoration: 'underline' }}>
            Connect it
          </Link>
          . The subscriber total above comes from the public counts and does not need it.
        </p>
      </Panel>
    );
  }

  const conn = data.connection;
  const s = summarise(data.days, period.startDate, period.endDate, data.dataThrough);
  const purgeOn =
    conn && conn.status !== 'connected' ? new Date(Date.parse(conn.verifiedAt ?? conn.connectedAt) + 30 * 86_400_000).toISOString() : null;
  const windowLabel = `${period.label}, activity on those days, not lifetime`;
  const val = (n: number | null, f: (v: number) => string = full) => (n === null ? NA : f(n));

  const gainedPoints = data.days.filter((d) => d.gained !== null).map((d) => ({ label: shortDate(d.day), value: d.gained as number }));
  const lostPoints = data.days.filter((d) => d.lost !== null).map((d) => ({ label: shortDate(d.day), value: d.lost as number }));
  const gapDays = data.days.length - gainedPoints.length;

  const trafficKnown = data.traffic.filter((t) => t.views !== null);
  const trafficSum = trafficKnown.reduce((n, t) => n + (t.views as number), 0);

  return (
    <div className="space-y-5">
      <Note>
        {conn?.status === 'revoked' && (
          <>
            <strong>Access to YouTube Analytics ended {conn.revokedAt ? shortDateTime(conn.revokedAt) : ''}.</strong> The
            figures below were read before then and are deleted on {purgeOn ? shortDate(purgeOn) : 'the 30th day'} unless
            the channel is <Link href="/admin/youtube" style={{ color: C.text, textDecoration: 'underline' }}>reconnected</Link>.{' '}
          </>
        )}
        {conn?.status === 'failing' && <><strong>The last YouTube Analytics read failed: {conn.lastError}.</strong>{' '}</>}
        {data.dataThrough ? (
          <>
            YouTube Analytics has figures through {shortDate(data.dataThrough)}
            {data.lastReadAt ? `, last read ${shortDateTime(data.lastReadAt)}` : ''}. YouTube finishes each day 48 to 72
            hours late
            {s.pendingDays > 0
              ? `, so the last ${s.pendingDays} ${s.pendingDays === 1 ? 'day' : 'days'} of this window ${s.pendingDays === 1 ? 'is' : 'are'} not in yet and every total here stops at ${shortDate(data.dataThrough)}`
              : ''}
            . Days are YouTube’s report days, which may not line up with Chiang Mai midnight.
          </>
        ) : (
          <>YouTube Analytics has not been read yet, or returned no days.</>
        )}
        {s.daysWithoutRow > 0 &&
          ` YouTube returned no row for ${s.daysWithoutRow} of the ${s.coveredDays} processed days in this window, so totals that need every day read Not available.`}
      </Note>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Watch time" value={val(s.minutes, (m) => duration(m * 60))} sub={windowLabel} />
        <StatTile label="Views" value={val(s.views)} sub={windowLabel} />
        <StatTile label="Average view duration" value={val(s.avgDurationSeconds, duration)} sub="Watch time divided by views, in this window" />
        <StatTile label="Average percentage viewed" value={val(s.avgPercent, (p) => `${p}%`)} sub="Per view, weighted by each day’s views" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile label="Subscribers gained" value={val(s.gained)} sub={windowLabel} />
        <StatTile label="Subscribers lost" value={val(s.lost)} sub={windowLabel} />
        <StatTile
          label="Net subscribers"
          value={s.gained === null || s.lost === null ? NA : `${s.gained - s.lost >= 0 ? '+' : ''}${full(s.gained - s.lost)}`}
          sub="Gained minus lost, in this window"
        />
      </div>

      <Panel
        title="YouTube subscribers gained per day"
        description={`From YouTube Analytics, by day.${gapDays > 0 ? ` ${gapDays} ${gapDays === 1 ? 'day has' : 'days have'} no figure and ${gapDays === 1 ? 'is' : 'are'} left out.` : ''}`}
      >
        <TrendChart points={gainedPoints} color={platformColor('youtube')} valueLabel="Gained" emptyMessage="Needs at least two days of figures in this window." />
      </Panel>
      <Panel title="YouTube subscribers lost per day" description="The same days, on their own axis.">
        <TrendChart points={lostPoints} color={SERIES.general} valueLabel="Lost" emptyMessage="Needs at least two days of figures in this window." />
      </Panel>

      <Panel
        title="Where YouTube views came from"
        description={`Views by traffic source, ${period.label.toLowerCase()}. Activity in the window, not lifetime.`}
        detail={{
          summary: 'What this report can and cannot say',
          children: (
            <>
              From YouTube Analytics’ traffic source report, by day. It gives views and watch time per
              source and nothing else: average view duration, percentage viewed and subscribers are not
              reported per source. YouTube limits some traffic source data below thresholds it does not
              publish, so a source missing from a day is unknown, not zero, and the sources can add up to
              fewer views than the channel total.
            </>
          ),
        }}
      >
        {s.views !== null && trafficKnown.length > 0 && trafficSum !== s.views && (
          <p className="text-xs mb-2" style={{ color: C.muted }}>
            The sources below account for {full(trafficSum)} of {full(s.views)} views in this window. YouTube did not attribute the rest in this report.
          </p>
        )}
        <BarList
          color={platformColor('youtube')}
          valueLabel="Views"
          emptyMessage="No traffic source figures in this window."
          data={trafficKnown.map((t) => ({
            key: t.sourceType,
            label: trafficLabel(t.sourceType),
            value: t.views as number,
            meta: t.minutes === null ? 'watch time not available' : `${duration(t.minutes * 60)} watched`,
          }))}
        />
        {data.traffic.length > trafficKnown.length && (
          <p className="text-xs mt-2" style={{ color: C.muted }}>
            Reported without a complete views figure, so not drawn:{' '}
            {data.traffic.filter((t) => t.views === null).map((t) => trafficLabel(t.sourceType)).join(', ')}.
          </p>
        )}
      </Panel>
    </div>
  );
}
