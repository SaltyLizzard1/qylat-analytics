import { sql } from '@/lib/db';
import { severityBad } from '@/lib/severity';
import { C, RADIUS, TITLE, shortDate, shortDateTime } from '@/lib/theme';
import { YT_ANALYTICS_SCOPES } from '@/lib/ytanalytics';
import { getConnection, hasAnalyticsTables } from '@/lib/ytanalytics-store';
import { Disconnect } from './Disconnect';

export const dynamic = 'force-dynamic';

/**
 * Connects the channel to YouTube Analytics, shows the state of that
 * connection, and disconnects it. Read-only access only. Nothing secret is
 * ever rendered: the refresh token stays in the database, encrypted.
 */

const RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Connected. Google granted read-only access to the right channel and a test report succeeded.' },
  denied: { ok: false, text: 'You declined on Google’s consent screen. Nothing was stored.' },
  state: { ok: false, text: 'The sign-in could not be matched to this browser, or took longer than 10 minutes. Nothing was stored. Try again.' },
  'google-error': { ok: false, text: 'Google returned an error instead of a code. Nothing was stored.' },
  exchange: { ok: false, text: 'Google would not exchange the code for a token. Nothing was stored. Check the client id, secret and redirect address.' },
  'no-refresh': { ok: false, text: 'Google issued no refresh token, so daily reads would stop within an hour. Nothing was stored and the access was revoked. Try again.' },
  scopes: { ok: false, text: 'Both read-only permissions are needed and one was not granted. Nothing was stored and the access was revoked.' },
  'wrong-channel': { ok: false, text: 'The account you chose is not the channel this dashboard is set to. Nothing was stored and the access was revoked. Choose the LIT channel on Google’s account picker.' },
  verify: { ok: false, text: 'The test report failed, so nothing was stored and the access was revoked. Check that the YouTube Analytics API is enabled in the Google Cloud project.' },
  migration: { ok: false, text: 'Migration 015 has not been applied, so there is nowhere to store the connection.' },
  config: { ok: false, text: 'The OAuth client is not configured. See which setting is missing below.' },
  disconnected: { ok: true, text: 'Disconnected. Google confirmed the revoke, and the stored token and every stored YouTube Analytics figure were deleted.' },
  'disconnected-unconfirmed': { ok: false, text: 'Disconnected here: the stored token and every stored figure were deleted. Google did not confirm the revoke, so remove the app at myaccount.google.com/permissions to be sure.' },
  'disconnected-nothing': { ok: true, text: 'Disconnected. No token was stored, so there was nothing to revoke at Google. Every stored figure was deleted.' },
};

const ENV = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'YOUTUBE_OAUTH_REDIRECT_URI', 'YOUTUBE_TOKEN_KEY', 'YOUTUBE_CHANNEL_ID'];

export default async function YouTubeAdminPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams;
  const shown = result ? RESULT[result] : undefined;
  const missingEnv = ENV.filter((n) => !process.env[n]);
  const tables = await hasAnalyticsTables();
  const conn = tables ? await getConnection() : null;
  const runs = tables
    ? await sql`SELECT finished_at, ok, start_date::text AS s, end_date::text AS e, data_through::text AS through, daily_rows, traffic_rows, error
                FROM youtube_analytics_runs ORDER BY finished_at DESC LIMIT 5`
    : [];

  const box = { background: C.card, border: `1px solid ${C.border}`, borderRadius: RADIUS.md };
  return (
    <div className="space-y-5">
      <div>
        <h1 className="mb-1" style={{ ...TITLE, fontSize: '1.6rem' }}>
          YouTube Analytics
        </h1>
        <p className="text-sm" style={{ color: C.muted, maxWidth: '70ch' }}>
          Watch time, average view duration and percentage viewed, subscribers gained and lost, and
          traffic sources, read from YouTube Analytics with read-only access. The public view, like
          and comment counts come from a different import and do not need this. Every time on this
          page is Chiang Mai time.
        </p>
      </div>

      {shown && (
        <p className="p-3 text-sm" role="status" style={{ ...box, color: shown.ok ? C.text : severityBad.color }}>
          {shown.text}
        </p>
      )}

      <div className="p-5 space-y-3" style={box}>
        <h2 style={{ fontWeight: 600 }}>Connection</h2>
        {!tables ? (
          <p className="text-sm">Migration 015 has not been applied. Nothing can be connected yet.</p>
        ) : !conn ? (
          <p className="text-sm">Not connected.</p>
        ) : (
          <dl className="grid gap-1 text-sm" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: '1rem' }}>
            <dt style={{ color: C.muted }}>Status</dt>
            <dd>
              {conn.status === 'connected' && 'Connected'}
              {conn.status === 'failing' && 'Connected, but the last read failed'}
              {conn.status === 'revoked' && 'Access ended. Reconnect to resume.'}
            </dd>
            <dt style={{ color: C.muted }}>Channel</dt>
            <dd>
              {conn.channelTitle || 'Untitled'} ({conn.channelId})
            </dd>
            <dt style={{ color: C.muted }}>Connected</dt>
            <dd>{shortDateTime(conn.connectedAt)}</dd>
            <dt style={{ color: C.muted }}>Access last confirmed</dt>
            <dd>{conn.verifiedAt ? shortDateTime(conn.verifiedAt) : 'never'}</dd>
            {conn.revokedAt && (
              <>
                <dt style={{ color: C.muted }}>Access ended</dt>
                <dd>{shortDateTime(conn.revokedAt)}</dd>
              </>
            )}
            {conn.lastError && (
              <>
                <dt style={{ color: C.muted }}>Last error</dt>
                <dd>{conn.lastError}</dd>
              </>
            )}
          </dl>
        )}

        {missingEnv.length > 0 ? (
          <p className="text-sm" style={{ color: severityBad.color }}>
            Not configured on this deployment: {missingEnv.join(', ')}.
          </p>
        ) : (
          tables && (
            <a
              href="/api/youtube/oauth/start"
              className="inline-block px-3 py-1.5 rounded text-sm"
              style={{ background: C.ink, color: C.onInk, fontWeight: 500, textDecoration: 'none' }}
            >
              {conn ? 'Reconnect with Google' : 'Connect with Google'}
            </a>
          )
        )}
        <p className="text-xs" style={{ color: C.muted }}>
          Asks Google for two read-only permissions and nothing else: {YT_ANALYTICS_SCOPES.map((s) => s.split('/').at(-1)).join(' and ')}.
          They cannot change the channel, upload, comment or see revenue. Stored analytics are deleted
          when you disconnect, and after 30 days without confirmed access.
        </p>
      </div>

      {tables && runs.length > 0 && (
        <div className="p-5" style={box}>
          <h2 className="mb-2" style={{ fontWeight: 600 }}>Recent reads</h2>
          <ul className="text-sm space-y-1">
            {runs.map((r, i) => (
              <li key={i}>
                {shortDateTime(r.finished_at as string)}:{' '}
                {r.ok
                  ? `${r.daily_rows} days and ${r.traffic_rows} traffic source rows for ${shortDate(r.s as string)} to ${shortDate(r.e as string)}, data through ${r.through ? shortDate(r.through as string) : 'none returned'}`
                  : `failed: ${r.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tables && conn && (
        <div className="p-5" style={box}>
          <h2 className="mb-2" style={{ fontWeight: 600 }}>Disconnect</h2>
          <Disconnect />
        </div>
      )}
    </div>
  );
}
