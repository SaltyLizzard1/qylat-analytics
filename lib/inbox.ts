/**
 * Owner inbox: read-only access to the email conversation tables (email_threads, email_events) in the shared
 * Supabase project. Server-side only. No dependency is added: it reads the PostgREST endpoint with fetch.
 *
 * Access is deliberately narrow. The page signs in to the database as the role owner_inbox_ro, which can read
 * email_threads and email_events and nothing else: no orders, no payments, no writes. It never holds the
 * service role key.
 *
 * Env (server only, never NEXT_PUBLIC; this module is imported only by server components):
 *   INBOX_SUPABASE_URL       project URL
 *   INBOX_SUPABASE_API_KEY   the project's public (anon) key, required by the API gateway on every request
 *   INBOX_SUPABASE_READ_JWT  a token whose role claim is owner_inbox_ro
 *   INBOX_FIXTURE=1          show built-in sample data instead, for local preview before the tables exist
 */

export const STATUSES = ['needs_attention', 'failed', 'processing', 'received', 'replied'] as const;
export type ThreadStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<ThreadStatus, string> = {
  needs_attention: 'Needs attention',
  failed: 'Failed',
  processing: 'Processing',
  received: 'Received',
  replied: 'Replied',
};

// Colour supports the word, it never replaces it.
export const STATUS_COLOR: Record<ThreadStatus, string> = {
  needs_attention: '#B45309',
  failed: '#B91C1C',
  processing: '#1D4ED8',
  received: '#4B5563',
  replied: '#15803D',
};

export type Thread = {
  id: string;
  brand: 'i2p' | 'qylat';
  mailbox: string;
  customer_email: string;
  customer_name: string | null;
  subject: string | null;
  status: ThreadStatus;
  status_reason: string | null;
  category: string | null;
  submission_id: string | null;
  auto_reply_count: number;
  last_message_at: string;
};

export type ThreadEvent = {
  id: string;
  thread_id: string;
  event_type: string;
  direction: 'inbound' | 'outbound' | 'internal';
  actor: string;
  summary: string | null;
  body: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type InboxResult<T> =
  | { state: 'ok'; data: T; fixture: boolean }
  | { state: 'not_configured' }
  | { state: 'error'; message: string };

export const BRAND_LABEL: Record<string, string> = { i2p: 'IdeaToPlan', qylat: 'QYLAT' };

export const EVENT_LABEL: Record<string, string> = {
  received: 'Email received',
  classified: 'Classified',
  draft: 'Reply drafted, not sent',
  reply_sent: 'Reply sent',
  escalated: 'Sent to you',
  owner_alert: 'You were alerted',
  failed: 'Failed',
  owner_action: 'Your action',
};

const FIXTURE_THREADS: Thread[] = [
  { id: 'fx-1', brand: 'i2p', mailbox: 'liz@ideatoplan.to', customer_email: 'pat@example.com', customer_name: 'Pat Example', subject: 'I would like a refund', status: 'needs_attention', status_reason: 'customer mentions a refund or chargeback', category: 'refund', submission_id: null, auto_reply_count: 0, last_message_at: '2026-10-06T03:10:00Z' },
  { id: 'fx-2', brand: 'i2p', mailbox: 'liz@ideatoplan.to', customer_email: 'sam@example.com', customer_name: 'Sam Example', subject: 'Where is my plan?', status: 'needs_attention', status_reason: 'Shadow mode: a routine reply was drafted and not sent. Review the draft.', category: 'order_status', submission_id: 'fx-order', auto_reply_count: 0, last_message_at: '2026-10-06T02:40:00Z' },
  { id: 'fx-3', brand: 'i2p', mailbox: 'liz@ideatoplan.to', customer_email: 'lee@example.com', customer_name: null, subject: 'Question about my order', status: 'failed', status_reason: 'The model call failed. No reply was drafted or sent.', category: null, submission_id: null, auto_reply_count: 0, last_message_at: '2026-10-06T01:55:00Z' },
  { id: 'fx-4', brand: 'i2p', mailbox: 'liz@ideatoplan.to', customer_email: 'kim@example.com', customer_name: 'Kim Example', subject: 'How does it work?', status: 'processing', status_reason: null, category: null, submission_id: null, auto_reply_count: 0, last_message_at: '2026-10-06T03:29:00Z' },
  { id: 'fx-5', brand: 'i2p', mailbox: 'liz@ideatoplan.to', customer_email: 'ray@example.com', customer_name: 'Ray Example', subject: 'Thank you', status: 'replied', status_reason: 'Routine reply sent.', category: 'thanks', submission_id: null, auto_reply_count: 1, last_message_at: '2026-10-05T11:20:00Z' },
];

const FIXTURE_EVENTS: ThreadEvent[] = [
  { id: 'fe-1', thread_id: 'fx-2', event_type: 'received', direction: 'inbound', actor: 'sam@example.com', summary: 'Where is my plan?', body: 'Hi, I ordered on Monday. Has my plan been sent yet?', detail: {}, created_at: '2026-10-06T02:40:00Z' },
  { id: 'fe-2', thread_id: 'fx-2', event_type: 'draft', direction: 'internal', actor: 'ai', summary: 'Shadow mode: a routine reply was drafted and not sent. Review the draft.', body: 'Hi Sam, your order is recorded and your plan has been generated. Plans are delivered within 72 hours of your order.\n\nElizabeth Alfond, IdeaToPlan', detail: { category: 'order_status', confidence: 0.93, reasons: [], shadow: true }, created_at: '2026-10-06T02:40:20Z' },
  { id: 'fe-3', thread_id: 'fx-2', event_type: 'owner_alert', direction: 'internal', actor: 'system', summary: 'Alert emailed to liz@ideatoplan.to', body: null, detail: {}, created_at: '2026-10-06T02:40:21Z' },
  { id: 'fe-4', thread_id: 'fx-1', event_type: 'received', direction: 'inbound', actor: 'pat@example.com', summary: 'I would like a refund', body: 'The plan is not what I expected. I want a refund please.', detail: {}, created_at: '2026-10-06T03:10:00Z' },
  { id: 'fe-5', thread_id: 'fx-1', event_type: 'escalated', direction: 'internal', actor: 'ai', summary: 'customer mentions a refund or chargeback', body: null, detail: { category: 'refund', reasons: ['customer mentions a refund or chargeback'] }, created_at: '2026-10-06T03:10:15Z' },
];

function mode(): 'fixture' | 'live' | 'none' {
  if (process.env.INBOX_FIXTURE === '1') return 'fixture';
  if (process.env.INBOX_SUPABASE_URL && process.env.INBOX_SUPABASE_API_KEY && process.env.INBOX_SUPABASE_READ_JWT) return 'live';
  return 'none';
}

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${process.env.INBOX_SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: process.env.INBOX_SUPABASE_API_KEY!, Authorization: `Bearer ${process.env.INBOX_SUPABASE_READ_JWT!}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Inbox read failed with HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function getThreads(): Promise<InboxResult<Thread[]>> {
  const m = mode();
  if (m === 'none') return { state: 'not_configured' };
  if (m === 'fixture') return { state: 'ok', data: FIXTURE_THREADS, fixture: true };
  try {
    const data = await rest<Thread[]>('email_threads?select=*&order=last_message_at.desc&limit=200');
    return { state: 'ok', data, fixture: false };
  } catch (err) {
    return { state: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function getThread(id: string): Promise<InboxResult<{ thread: Thread; events: ThreadEvent[] } | null>> {
  const m = mode();
  if (m === 'none') return { state: 'not_configured' };
  if (m === 'fixture') {
    const thread = FIXTURE_THREADS.find((t) => t.id === id);
    return { state: 'ok', fixture: true, data: thread ? { thread, events: FIXTURE_EVENTS.filter((e) => e.thread_id === id) } : null };
  }
  // Ids are UUIDs. Anything else is refused before it reaches the query string.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { state: 'ok', fixture: false, data: null };
  try {
    const [threads, events] = await Promise.all([
      rest<Thread[]>(`email_threads?id=eq.${id}&select=*`),
      rest<ThreadEvent[]>(`email_events?thread_id=eq.${id}&select=*&order=created_at.asc`),
    ]);
    return { state: 'ok', fixture: false, data: threads[0] ? { thread: threads[0], events } : null };
  } catch (err) {
    return { state: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
