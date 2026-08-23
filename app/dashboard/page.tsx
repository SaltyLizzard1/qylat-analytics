import { severityWarning } from '@/lib/severity';

const PLANNED_VIEWS = [
  {
    number: '01',
    title: 'Post Leaderboard',
    description: 'Every post ranked by clicks per impression, not by reach. The posts actually driving traffic, front and center.',
    emptyAction: 'Create your first /go/ link before your next post. That is what starts the data.',
    phase: 2,
  },
  {
    number: '02',
    title: 'Platform Comparison',
    description: 'Instagram vs Facebook vs TikTok vs YouTube: which platform produces the most site visits per post published.',
    emptyAction: 'Data appears here after you have used /go/ links across at least two platforms.',
    phase: 2,
  },
  {
    number: '03',
    title: 'Format Comparison',
    description: 'Reels vs carousels vs Stories vs Shorts, measured on click-through rate, not raw reach.',
    emptyAction: 'Needs click data from multiple post formats.',
    phase: 2,
  },
  {
    number: '04',
    title: 'Content Theme Performance',
    description: 'Which topics actually drive traffic. Groups posts by source blog theme so you know what to write next.',
    emptyAction: 'Tag posts with a content theme when you create the /go/ link.',
    phase: 4,
  },
  {
    number: '05',
    title: 'CTA Destination',
    description: 'Leap Log vs readiness quiz vs 60-Day Leap Kit. Which call to action actually converts, by platform.',
    emptyAction: 'Select a CTA type when creating each /go/ link.',
    phase: 2,
  },
  {
    number: '06',
    title: 'QYLAT to IdeaToPlan Funnel',
    description: 'How many social-driven sessions on QYLAT go on to reach IdeaToPlan. The full top-of-funnel picture.',
    emptyAction: 'This view requires the Vercel Analytics integration (Phase 3).',
    phase: 3,
  },
  {
    number: '07',
    title: 'Weekly Trend',
    description: 'Social-driven sessions per week. The one chart that tells you whether the whole effort is compounding.',
    emptyAction: 'Needs a few weeks of /go/ link data to be meaningful.',
    phase: 2,
  },
];

export default function DashboardPage() {
  return (
    <div>
      <div
        className="mb-8 px-5 py-4 rounded-lg flex items-start gap-4"
        style={severityWarning}
      >
        <div
          className="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
          style={{ background: '#8A5A00', color: '#FFFFFF' }}
        >
          2
        </div>
        <div>
          <p className="font-semibold text-sm" style={{ color: '#8A5A00' }}>
            Phase 2 complete: link tracker live
          </p>
          <p className="text-sm mt-1" style={{ color: '#8A5A00' }}>
            Create a /go/ link for each post. Clicks appear under Links and Clicks.
          </p>
        </div>
      </div>

      <h2
        className="text-2xl mb-6"
        style={{ fontWeight: 600, color: '#111111' }}
      >
        Coming views
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLANNED_VIEWS.map((view) => (
          <div
            key={view.number}
            className="rounded-lg p-5"
            style={{ background: '#FFFFFF', border: '1px solid #D0D0D0' }}
          >
            <div className="flex items-start justify-between mb-3">
              <span
                className="text-3xl"
                style={{ fontWeight: 600, color: '#111111' }}
              >
                {view.number}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: '#F2F2F2', color: '#555555' }}
              >
                Phase {view.phase}
              </span>
            </div>

            <h3 className="text-sm mb-2" style={{ fontWeight: 600, color: '#111111' }}>
              {view.title}
            </h3>
            <p className="text-xs leading-relaxed mb-4" style={{ color: '#555555' }}>
              {view.description}
            </p>

            <div
              className="text-xs px-3 py-2 rounded"
              style={{ background: '#F2F2F2', color: '#555555' }}
            >
              To populate: {view.emptyAction}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
