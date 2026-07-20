import { useMemo, useState } from "react";
import type { SessionEventRecord } from "@provenance/shared";

interface Frame { timestamp: string; code: string; }

export function ReplayTab({ events, finalCode }: { events: SessionEventRecord[]; finalCode: string | null }): JSX.Element {
  const frames = useMemo<Frame[]>(() => {
    const edits = events.filter((event) => event.type === "CODE_EDIT" && typeof event.payload.after === "string");
    if (edits.length === 0) return [];
    const first = edits[0];
    const initial: Frame[] = typeof first.payload.before === "string" ? [{ timestamp: first.timestamp, code: String(first.payload.before) }] : [];
    const rest: Frame[] = edits.map((event) => ({ timestamp: event.timestamp, code: String(event.payload.after) }));
    return [...initial, ...rest];
  }, [events]);

  const [index, setIndex] = useState(Math.max(0, frames.length - 1));

  if (frames.length === 0) {
    return <pre className="max-h-[65vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-5 font-mono text-xs leading-6 text-slate-100">{finalCode ?? "No code recorded for this session."}</pre>;
  }

  const clampedIndex = Math.min(index, frames.length - 1);
  const frame = frames[clampedIndex];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="range" min={0} max={frames.length - 1} value={clampedIndex}
          onChange={(event) => setIndex(Number(event.target.value))}
          className="flex-1 accent-teal"
        />
        <span className="w-20 shrink-0 text-right font-mono text-xs text-slate-500">{clampedIndex + 1}/{frames.length}</span>
      </div>
      <p className="font-mono text-xs text-slate-400">{new Date(frame.timestamp).toLocaleTimeString()}</p>
      <pre className="max-h-[60vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-5 font-mono text-xs leading-6 text-slate-100">{frame.code}</pre>
    </div>
  );
}
