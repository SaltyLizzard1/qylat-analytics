import Link from 'next/link';
import { CARD, TITLE, EYEBROW, shortDateTime } from '@/lib/theme';
import { BRAND_LABEL, STATUSES, STATUS_COLOR, STATUS_LABEL, getThreads, type Thread } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

/**
 * Owner inbox. One page that answers "what needs me": every customer email conversation, grouped by status,
 * with the ones waiting for the owner first. Read-only. Each row opens the conversation and its history.
 */
export default async function InboxPage() {
  const result = await getThreads();

  if (result.state === 'not_configured') {
    return <Notice title="Inbox is not connected yet" body="Set INBOX_SUPABASE_URL, INBOX_SUPABASE_API_KEY and INBOX_SUPABASE_READ_JWT on the server, or INBOX_FIXTURE=1 to preview with sample data." />;
  }
  if (result.state === 'error') {
    return <Notice title="The inbox could not be read" body={result.message + '. Nothing is hidden: check the conversation tables directly until this is fixed.'} />;
  }

  const threads = result.data;
  const by = (s: string) => threads.filter((t) => t.status === s);

  return (
    <div>
      <div className="mb-6">
        <p style={EYEBROW}>Customer email</p>
        <h1 className="text-2xl" style={TITLE}>I2P Inbox</h1>
        {result.fixture && (
          <p className="text-sm mt-2" style={{ color: '#B45309' }}>Sample data. This is a preview, not your real mail.</p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {STATUSES.map((s) => (
          <a key={s} href={`#${s}`} style={{ ...CARD, padding: '14px 16px', textDecoration: 'none', display: 'block' }}>
            <div className="text-2xl" style={{ fontWeight: 600, color: STATUS_COLOR[s] }}>{by(s).length}</div>
            <div className="text-xs" style={{ color: '#111111' }}>{STATUS_LABEL[s]}</div>
          </a>
        ))}
      </div>

      {threads.length === 0 && <p className="text-sm" style={{ color: '#4B5563' }}>No conversations recorded yet.</p>}

      {STATUSES.map((s) => {
        const rows = by(s);
        if (rows.length === 0) return null;
        return (
          <section key={s} id={s} className="mb-8">
            <h2 className="text-sm mb-2" style={{ fontWeight: 600, color: STATUS_COLOR[s] }}>
              {STATUS_LABEL[s]} ({rows.length})
            </h2>
            <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
              {rows.map((t, i) => <Row key={t.id} t={t} first={i === 0} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Row({ t, first }: { t: Thread; first: boolean }) {
  return (
    <Link
      href={`/admin/inbox/${t.id}`}
      className="block px-4 py-3"
      style={{ textDecoration: 'none', color: '#111111', borderTop: first ? 'none' : '1px solid #E5E7EB' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm min-w-0 truncate" style={{ fontWeight: 600 }}>{t.subject || '(no subject)'}</span>
        <span className="text-xs flex-shrink-0" style={{ color: '#4B5563' }}>{shortDateTime(t.last_message_at)}</span>
      </div>
      <div className="text-xs mt-1 min-w-0 truncate" style={{ color: '#4B5563' }}>
        {BRAND_LABEL[t.brand] ?? t.brand} · {t.customer_name ? `${t.customer_name}, ` : ''}{t.customer_email}
        {t.category ? ` · ${t.category.replace(/_/g, ' ')}` : ''}
      </div>
      {t.status_reason && <div className="text-xs mt-1" style={{ color: '#111111' }}>{t.status_reason}</div>}
    </Link>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ ...CARD, padding: '20px' }}>
      <h1 className="text-lg mb-2" style={TITLE}>{title}</h1>
      <p className="text-sm" style={{ color: '#111111' }}>{body}</p>
    </div>
  );
}
