import { useState } from "react";
import type { SessionEventRecord } from "@provenance/shared";

const LEGEND: Array<{ label: string; color: string }> = [
  { label: "editing", color: "#2f807a" },
  { label: "paste", color: "#c2410c" },
  { label: "ai chat", color: "#7c3aed" },
  { label: "test run", color: "#0891b2" },
  { label: "idle", color: "#94a3b8" },
  { label: "submit", color: "#172033" }
];

function categoryOf(type: string): { label: string; color: string } {
  switch (type) {
    case "CODE_EDIT": return { label: "editing", color: "#2f807a" };
    case "CODE_PASTED": return { label: "paste", color: "#c2410c" };
    case "PROMPT_SENT":
    case "AI_RESPONSE": return { label: "ai chat", color: "#7c3aed" };
    case "TEST_RUN": return { label: "test run", color: "#0891b2" };
    case "IDLE_GAP": return { label: "idle", color: "#94a3b8" };
    case "SUBMIT": return { label: "submit", color: "#172033" };
    default: return { label: "session start", color: "#cbd5e1" };
  }
}

function widthFor(event: SessionEventRecord): number {
  if (event.type === "IDLE_GAP") return Math.min(220, 28 + Number(event.payload.durationSeconds ?? 0) / 4);
  return 26;
}

export function TimelineTab({ events }: { events: SessionEventRecord[] }): JSX.Element {
  const [selected, setSelected] = useState<SessionEventRecord | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        {LEGEND.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="flex items-end gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4">
        {events.map((event) => {
          const meta = categoryOf(event.type);
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => setSelected(event)}
              title={`${event.type} @ ${new Date(event.timestamp).toLocaleTimeString()}`}
              style={{ background: meta.color, width: widthFor(event) }}
              className={`h-10 shrink-0 rounded transition ${selected?.id === event.id ? "ring-2 ring-ink ring-offset-2" : "opacity-90 hover:opacity-100"}`}
            />
          );
        })}
      </div>

      {selected ? <EventDetail event={selected} /> : <p className="text-sm text-slate-400">Click a block above to inspect that moment.</p>}
    </div>
  );
}

function EventDetail({ event }: { event: SessionEventRecord }): JSX.Element {
  const payload = event.payload;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">{event.type.replace("_", " ")}</p>
        <p className="font-mono text-xs text-slate-400">{new Date(event.timestamp).toLocaleString()}</p>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        {typeof payload.text === "string" && <p className="whitespace-pre-wrap text-slate-700">{payload.text}</p>}
        {typeof payload.category === "string" && <p className="text-[10px] font-bold tracking-wide text-teal">{payload.category.replace("_", " ")}</p>}
        {typeof payload.before === "string" && typeof payload.after === "string" && (
          <div className="grid grid-cols-1 gap-3 font-mono text-xs md:grid-cols-2">
            <pre className="max-h-48 overflow-auto rounded-lg bg-rose-50 p-3 text-rose-700">{payload.before || "(empty)"}</pre>
            <pre className="max-h-48 overflow-auto rounded-lg bg-emerald-50 p-3 text-emerald-700">{payload.after || "(empty)"}</pre>
          </div>
        )}
        {typeof payload.content === "string" && (
          <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">{payload.content}</pre>
        )}
        {"matchesRecentAi" in payload && (
          <p className={payload.matchesRecentAi ? "text-xs font-semibold text-accent" : "text-xs text-slate-400"}>
            {payload.matchesRecentAi ? "Matches a recent AI response" : "Does not match a recent AI response"}
          </p>
        )}
        {typeof payload.allPassed === "boolean" && (
          <p className={payload.allPassed ? "text-sm font-semibold text-emerald-600" : "text-sm font-semibold text-rose-600"}>
            {payload.allPassed ? "All tests passed" : `Failed: ${String(payload.failedTest ?? "unknown")}`}
            {payload.hidden ? " (hidden tests)" : ""}
          </p>
        )}
        {typeof payload.durationSeconds === "number" && <p className="text-slate-500">{payload.durationSeconds}s idle</p>}
        {typeof payload.hiddenPassed === "number" && typeof payload.hiddenTotal === "number" && (
          <p className="text-slate-600">Hidden tests: {payload.hiddenPassed}/{payload.hiddenTotal} passed</p>
        )}
      </div>
    </div>
  );
}
