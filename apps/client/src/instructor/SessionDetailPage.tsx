import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SessionDetailResponse } from "@provenance/shared";
import { ReportTab } from "./ReportTab.js";
import { TimelineTab } from "./TimelineTab.js";
import { ReplayTab } from "./ReplayTab.js";

type Tab = "report" | "timeline" | "replay";
const TABS: Tab[] = ["report", "timeline", "replay"];

export function SessionDetailPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("report");

  useEffect(() => {
    if (!sessionId) return;
    void (async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) throw new Error("Session not found.");
        setSession(await response.json() as SessionDetailResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load session.");
      }
    })();
  }, [sessionId]);

  if (error) return <div className="min-h-screen bg-paper p-8 text-sm font-semibold text-rose-600">{error}</div>;
  if (!session) return <div className="min-h-screen bg-paper p-8 text-sm text-slate-500">Loading session…</div>;

  return (
    <div className="min-h-screen bg-paper p-8">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <Link to="/instructor" className="text-xs font-semibold text-slate-500 hover:text-teal hover:underline">← All sessions</Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{session.studentName}</h1>
          <p className="text-sm text-slate-500">{session.assignment.title} · started {new Date(session.startedAt).toLocaleString()}</p>
        </div>
        <span className="rounded-full bg-[#f2f6f5] px-3 py-1.5 text-xs font-bold text-teal">{session.status}</span>
      </header>

      <nav className="mb-6 flex gap-2 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`px-4 py-2 text-sm font-bold capitalize ${tab === item ? "border-b-2 border-teal text-teal" : "text-slate-400 hover:text-slate-600"}`}
          >
            {item}
          </button>
        ))}
      </nav>

      {tab === "report" && <ReportTab session={session} />}
      {tab === "timeline" && <TimelineTab events={session.events} />}
      {tab === "replay" && <ReplayTab events={session.events} finalCode={session.finalCode} />}
    </div>
  );
}
