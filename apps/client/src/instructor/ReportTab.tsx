import type { SessionDetailResponse } from "@provenance/shared";

function Gauge({ label, value, color }: { label: string; value: number; color: string }): JSX.Element {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6">
      <svg width="120" height="120" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e6e6e6" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="57" textAnchor="middle" fontSize="24" fontWeight="800" fill="#172033">{value}</text>
      </svg>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

export function ReportTab({ session }: { session: SessionDetailResponse }): JSX.Element {
  if (!session.assessment) return <p className="text-sm text-slate-500">This session has not been assessed yet.</p>;
  const { report } = session.assessment;

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap gap-6">
        <Gauge label="Authorship" value={report.authorshipScore} color="#2f807a" />
        <Gauge label="Engagement" value={report.engagementScore} color="#e66a4e" />
        <div className="min-w-[280px] flex-1 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Process narrative</p>
          <p className="mt-3 text-sm leading-6 text-slate-700">{report.processNarrative}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-teal">Learning signals</p>
          <ul className="mt-3 space-y-3">
            {report.learningSignals.length === 0 && <li className="text-sm text-slate-400">None identified.</li>}
            {report.learningSignals.map((signal, index) => (
              <li key={index} className="text-sm">
                <span className="font-semibold text-ink">{signal.signal}</span>
                <p className="mt-0.5 text-slate-500">{signal.evidence}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-accent">Concern signals</p>
          <ul className="mt-3 space-y-3">
            {report.concernSignals.length === 0 && <li className="text-sm text-slate-400">None flagged.</li>}
            {report.concernSignals.map((signal, index) => (
              <li key={index} className="text-sm">
                <span className="font-semibold text-ink">{signal.signal}</span>
                <p className="mt-0.5 text-slate-500">{signal.evidence}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Viva questions</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {report.vivaQuestions.map((question, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-bold text-teal">Q{index + 1}</p>
              <p className="mt-2 text-sm font-semibold text-ink">{question.question}</p>
              <p className="mt-2 text-xs text-slate-500">Anchor: {question.anchor}</p>
              <p className="mt-1 text-xs text-slate-400">Expected understanding: {question.expectedUnderstanding}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
