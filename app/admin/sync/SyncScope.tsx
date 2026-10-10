import { C, RADIUS } from '@/lib/theme';

/**
 * What each control on this page refreshes, and what it leaves alone.
 *
 * The buttons are named for their source, and "Sync Facebook and Instagram"
 * reads as if it covered the personal Facebook Profile. It does not: the
 * Profile has no API and is only ever read by the collector on the laptop.
 * This says so beside the buttons, in the terms the dashboard uses for the
 * three accounts.
 */
const ROWS: { control: string; refreshes: string; not: string; runs: string }[] = [
  {
    control: 'Sync Facebook and Instagram',
    refreshes: 'Instagram and the Facebook Page: posts, their figures, and follower counts.',
    not: 'Not the Facebook Profile.',
    runs: 'Also runs by itself once a day, at about 15:00.',
  },
  {
    control: 'Sync Google Analytics',
    refreshes: 'Website sessions.',
    not: 'No social account.',
    runs: 'Also runs by itself once a day, between 15:30 and 16:30.',
  },
  {
    control: 'Collect Facebook profile',
    refreshes: 'The Facebook Profile only: its posts, stories, figures and followers.',
    not: 'Not Instagram or the Page.',
    runs: 'Never runs by itself. It needs the collector on the laptop, and reads posts from the last 28 days.',
  },
];

export function SyncScope() {
  return (
    <div className="mt-4">
      <p className="text-xs uppercase mb-2" style={{ color: C.muted, letterSpacing: '0.08em' }}>
        What each one refreshes
      </p>
      <ul className="flex flex-col gap-2">
        {ROWS.map((r) => (
          <li key={r.control} className="text-sm px-3 py-2" style={{ background: C.neutral, borderRadius: RADIUS.sm, lineHeight: 1.5 }}>
            <span style={{ color: C.text, fontWeight: 600 }}>{r.control}</span>
            <span style={{ color: C.text }}> · {r.refreshes}</span> <span style={{ color: C.text, fontWeight: 600 }}>{r.not}</span>{' '}
            <span style={{ color: C.muted }}>{r.runs}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs mt-2" style={{ color: C.muted }}>
        After posting to all three accounts, a full refresh is two steps: sync Facebook and Instagram, then collect the Profile.
      </p>
    </div>
  );
}
