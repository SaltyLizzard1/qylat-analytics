import Link from 'next/link';
import { CARD, TITLE, EYEBROW, shortDateTime } from '@/lib/theme';
import { BRAND_LABEL, EVENT_LABEL, STATUS_COLOR, STATUS_LABEL, getThread } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

/**
 * One conversation: who wrote, what the status is and why, then every message and action in order.
 * Read-only. Replies are written in the mailbox itself, so this page cannot send anything.
 */
export default async function InboxThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getThread(id);

  const back = (
    <Link href="/admin/inbox" className="text-xs" style={{ color: '#111111', textDecoration: 'underline' }}>
      Back to inbox
    </Link>
  );

  if (result.state !== 'ok' || !result.data) {
    const message =
      result.state === 'error' ? result.message
      : result.state === 'not_configured' ? 'The inbox is not connected yet.'
      : 'This conversation was not found.';
    return (
      <div>
        {back}
        <div className="mt-4" style={{ ...CARD, padding: '20px' }}>
          <p className="text-sm" style={{ color: '#111111' }}>{message}</p>
        </div>
      </div>
    );
  }

  const { thread: t, events } = result.data;

  return (
    <div>
      {back}
      <div className="mt-4 mb-6">
        <p style={EYEBROW}>{BRAND_LABEL[t.brand] ?? t.brand} · {t.mailbox}</p>
        <h1 className="text-2xl" style={TITLE}>{t.subject || '(no subject)'}</h1>
        <p className="text-sm mt-1" style={{ color: '#4B5563' }}>
          {t.customer_name ? `${t.customer_name}, ` : ''}{t.customer_email}
        </p>
      </div>

      <div className="mb-6" style={{ ...CARD, padding: '16px 20px' }}>
        <div className="text-sm" style={{ fontWeight: 700, color: STATUS_COLOR[t.status] }}>{STATUS_LABEL[t.status]}</div>
        {t.status_reason && <p className="text-sm mt-1" style={{ color: '#111111' }}>{t.status_reason}</p>}
        <p className="text-xs mt-2" style={{ color: '#4B5563' }}>
          {t.category ? `Category: ${t.category.replace(/_/g, ' ')} · ` : ''}
          Automated replies sent: {t.auto_reply_count}
          {t.submission_id ? ` · Linked order: ${t.submission_id}` : ' · No linked order'}
        </p>
      </div>

      <h2 className="text-sm mb-2" style={{ fontWeight: 700, color: '#111111' }}>Conversation and action history</h2>
      {events.length === 0 && <p className="text-sm" style={{ color: '#4B5563' }}>No history recorded.</p>}
      <ol className="space-y-3">
        {events.map((e) => (
          <li key={e.id} style={{ ...CARD, padding: '14px 18px' }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm" style={{ fontWeight: 600, color: e.event_type === 'failed' ? '#B91C1C' : '#111111' }}>
                {EVENT_LABEL[e.event_type] ?? e.event_type}
              </span>
              <span className="text-xs flex-shrink-0" style={{ color: '#4B5563' }}>{shortDateTime(e.created_at)}</span>
            </div>
            <div className="text-xs mt-1" style={{ color: '#4B5563' }}>
              {e.direction === 'inbound' ? 'From ' : e.direction === 'outbound' ? 'To customer, by ' : 'By '}{e.actor}
            </div>
            {e.summary && <p className="text-sm mt-2" style={{ color: '#111111' }}>{e.summary}</p>}
            {e.body && (
              <pre className="text-sm mt-2" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#111111', background: '#F6F7FB', padding: '10px 12px', borderRadius: '8px' }}>
                {e.body}
              </pre>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
