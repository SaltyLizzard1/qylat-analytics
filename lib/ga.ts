import crypto from 'node:crypto';

/**
 * Google Analytics 4 Data API client.
 *
 * No SDK. The service account flow is a signed JWT exchanged for an access
 * token, which is about twenty lines with node:crypto, so google-auth-library
 * and @google-analytics/data both stay out of the bundle.
 *
 * Dimension names were verified against the live property rather than taken
 * from the docs, which are vague on session-scope UTM names:
 *   utm_source   -> sessionSource
 *   utm_medium   -> sessionMedium
 *   utm_campaign -> sessionCampaignName
 *   utm_content  -> sessionManualAdContent
 * `sessionAdContent` and `sessionContent` are both rejected by the API.
 *
 * utm_content is the important one: lib/utm.ts stamps it with the /go/ link
 * slug, so it is what joins a GA session back to a link, a platform and a
 * content theme.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';

export class GaApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'GaApiError';
  }
}

type ServiceAccount = { client_email: string; private_key: string };

export type GaConfig = { propertyId: string; account: ServiceAccount };

/**
 * Reads GA credentials from the environment.
 *
 * GA_SERVICE_ACCOUNT_B64 is the whole service account JSON, base64 encoded.
 * Base64 avoids the newline and quoting mess that the raw private_key field
 * causes in an environment variable.
 */
export function gaConfig(): GaConfig {
  const missing: string[] = [];
  const propertyId = process.env.GA_PROPERTY_ID;
  const encoded = process.env.GA_SERVICE_ACCOUNT_B64;

  if (!propertyId) missing.push('GA_PROPERTY_ID');
  if (!encoded) missing.push('GA_SERVICE_ACCOUNT_B64');
  if (missing.length > 0) {
    throw new Error(`Missing Google Analytics environment variables: ${missing.join(', ')}`);
  }

  /**
   * Accepts the service account either base64 encoded or as raw JSON.
   *
   * Base64 was the original advice because it survives shell quoting, but the
   * encoded blob is over three thousand characters and copying it out of a
   * terminal truncates easily, which is a silent failure. The key file is
   * already a single line, since its private_key holds escaped \n rather than
   * real newlines, so pasting the file contents straight in works and removes
   * the whole class of error. Both are supported and neither is wrong.
   */
  const raw = (encoded as string).trim();
  const decoded = raw.startsWith('{')
    ? raw
    : Buffer.from(raw.replace(/\s+/g, ''), 'base64').toString('utf8');

  let account: ServiceAccount;
  try {
    account = JSON.parse(decoded);
  } catch {
    throw new Error(
      `GA_SERVICE_ACCOUNT_B64 did not parse. It should be the service account JSON, ` +
        `either raw or base64 encoded. Got ${raw.length} characters starting "${raw.slice(0, 12)}". ` +
        `A truncated paste is the usual cause.`
    );
  }

  if (!account.client_email || !account.private_key) {
    throw new Error(
      'GA_SERVICE_ACCOUNT_B64 parsed but has no client_email or private_key. Wrong file?'
    );
  }

  return { propertyId: propertyId as string, account };
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Signs a JWT assertion and exchanges it for an access token. */
async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    base64url({ alg: 'RS256', typ: 'JWT' }) +
    '.' +
    base64url({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    });

  let signature: string;
  try {
    signature = crypto
      .createSign('RSA-SHA256')
      .update(unsigned)
      .sign(account.private_key)
      .toString('base64url');
  } catch (e) {
    throw new GaApiError(
      `Could not sign the JWT, the private key is probably malformed: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
    cache: 'no-store',
  });

  const body = (await response.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!body.access_token) {
    throw new GaApiError(
      `Token exchange failed: ${body.error_description ?? body.error ?? `HTTP ${response.status}`}`,
      response.status
    );
  }
  return body.access_token;
}

type ReportRow = {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
};

export type UtmSessionRow = {
  date: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  sessions: number;
  engagedSessions: number;
  activeUsers: number;
  keyEvents: number;
};

/** GA4 returns "(not set)" and sometimes an empty string. Normalise both. */
function dim(value: string | undefined): string {
  const v = (value ?? '').trim();
  return v === '' ? '(not set)' : v;
}

function metric(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sessions broken down by date and the four UTM dimensions.
 *
 * `days` should comfortably exceed one day. GA4 keeps revising recent figures
 * for 24 to 48 hours, so a daily job has to re-read a window and overwrite,
 * not append yesterday once and trust it.
 */
export async function fetchUtmSessions(cfg: GaConfig, days = 14): Promise<UtmSessionRow[]> {
  const token = await accessToken(cfg.account);

  const response = await fetch(`${DATA_API}/properties/${cfg.propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      dateRanges: [{ startDate: `${Math.max(1, days)}daysAgo`, endDate: 'today' }],
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' },
        { name: 'sessionManualAdContent' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'engagedSessions' },
        { name: 'activeUsers' },
        { name: 'keyEvents' },
      ],
      limit: 10000,
    }),
  });

  const body = (await response.json()) as {
    rows?: ReportRow[];
    error?: { message?: string; status?: string };
  };

  if (body.error) {
    const message = body.error.message ?? `HTTP ${response.status}`;
    if (response.status === 403) {
      throw new GaApiError(
        `${message} -- the service account is probably not a Viewer on property ${cfg.propertyId}`,
        403
      );
    }
    throw new GaApiError(message, response.status);
  }

  return (body.rows ?? []).map((row) => {
    const d = row.dimensionValues ?? [];
    const m = row.metricValues ?? [];
    // GA4 returns dates as YYYYMMDD.
    const raw = dim(d[0]?.value);
    const date = /^\d{8}$/.test(raw)
      ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
      : raw;

    return {
      date,
      source: dim(d[1]?.value),
      medium: dim(d[2]?.value),
      campaign: dim(d[3]?.value),
      content: dim(d[4]?.value),
      sessions: metric(m[0]?.value),
      engagedSessions: metric(m[1]?.value),
      activeUsers: metric(m[2]?.value),
      keyEvents: metric(m[3]?.value),
    };
  });
}

export function gaErrText(e: unknown): string {
  if (e instanceof GaApiError) return `${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`;
  return e instanceof Error ? e.message : String(e);
}
