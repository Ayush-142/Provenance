import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SessionListItem } from "@provenance/shared";

function formatDuration(startedAt: string, submittedAt: string | null): string {
  if (!submittedAt) return "in progress";
  const seconds = Math.max(0, Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function statusClasses(status: string): string {
  if (status === "ASSESSED") return "bg-teal/10 text-teal";
  if (status === "SUBMITTED") return "bg-accent/10 text-accent";
  return "bg-slate-100 text-slate-500";
}

export function SessionListPage(): JSX.Element {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/sessions");
        if (!response.ok) throw new Error("Could not load sessions.");
        setSessions(await response.json() as SessionListItem[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load sessions.");
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-paper p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-widest text-accent">INSTRUCTOR</p>
          <h1 className="text-2xl font-black tracking-tight">Sessions</h1>
        </div>
        <Link to="/" className="text-xs font-semibold text-slate-500 hover:text-teal hover:underline">← Back to workspace</Link>
      </header>

      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
      {!sessions && !error && <p className="text-sm text-slate-500">Loading sessions…</p>}
      {sessions && sessions.length === 0 && <p className="text-sm text-slate-500">No sessions yet. Run the seed script or complete a workspace session.</p>}

      {sessions && sessions.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f2f6f5] text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Student</th>
                <th className="px-5 py-3">Assignment</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3">Authorship</th>
                <th className="px-5 py-3">Engagement</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-t border-slate-100 hover:bg-[#fbfaf7]">
                  <td className="px-5 py-3">
                    <Link to={`/instructor/sessions/${session.id}`} className="font-semibold text-ink hover:text-teal hover:underline">{session.studentName}</Link>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{session.assignmentTitle}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{formatDuration(session.startedAt, session.submittedAt)}</td>
                  <td className="px-5 py-3 font-mono text-xs font-bold text-ink">{session.authorshipScore ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs font-bold text-ink">{session.engagementScore ?? "—"}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ${statusClasses(session.status)}`}>{session.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
