import { InfoTip } from '@/components/InfoTip';
import {
  baselineExplanation,
  changeLabel,
  reportedGainsDisclosure,
  type SupportedChange,
  type UncertainBaseline,
} from '@/lib/baseline';
import { C, RADIUS, longDate, platformLabel } from '@/lib/theme';

/**
 * How an uncertain opening total is shown, the same way on every page. The
 * rule itself is in lib/baseline.ts. These only word it.
 */

/** The chip. Neutral: it describes the record, not how the account is doing. */
export function BaselineChip({ b }: { b: UncertainBaseline }) {
  return (
    <span
      className="text-xs px-2 py-0.5 whitespace-nowrap"
      style={{ background: C.neutral, color: C.text, borderRadius: RADIUS.pill, fontWeight: 600 }}
      title={`The first total stored for this account, 0 on ${longDate(b.recorded_on)}, cannot be confirmed as a true count.`}
    >
      Baseline uncertain
    </span>
  );
}

/**
 * Above a chart of follower totals: the reading is named as uncertain and
 * not drawn, the change the totals do support is stated from the total and
 * date it starts at, and the long explanation is behind the button.
 */
export function BaselineNote({
  b,
  change,
  readingInWindow,
}: {
  b: UncertainBaseline;
  change: SupportedChange | null;
  /** The uncertain reading falls inside the window, so it would otherwise have been a point. */
  readingInWindow: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 text-sm" style={{ color: C.muted }}>
      <BaselineChip b={b} />
      <span>
        {readingInWindow && <>The 0 recorded on {longDate(b.recorded_on)} is not drawn. </>}
        <span style={{ color: C.text, fontWeight: 700 }}>
          {change ? changeLabel(change) : 'Not enough recorded totals after it in this window to state a change'}
        </span>
        .
      </span>
      <InfoTip text={baselineExplanation(b)} about={`${platformLabel(b.platform)} follower baseline`} />
    </div>
  );
}

/**
 * Above a chart of the platform's reported daily gains, when the window
 * takes in the step up from the uncertain reading. The gains are shown as
 * the platform reported them, labelled as such, with that step disclosed.
 */
export function ReportedGainsNote({ b }: { b: UncertainBaseline }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 text-sm" style={{ color: C.muted }}>
      <span
        className="text-xs px-2 py-0.5 whitespace-nowrap"
        style={{ background: C.neutral, color: C.text, borderRadius: RADIUS.pill, fontWeight: 600 }}
      >
        Reported by Meta
      </span>
      <span>Meta&apos;s own daily figures, not worked out from the totals. {reportedGainsDisclosure(b)}.</span>
      <InfoTip text={baselineExplanation(b)} about={`${platformLabel(b.platform)} reported gains`} />
    </div>
  );
}
