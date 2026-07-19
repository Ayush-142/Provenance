import type { EventType, SessionSummary } from "@provenance/shared";

export interface StoredEvent {
  type: EventType;
  timestamp: Date;
  payloadJson: string;
}

function payload(event: StoredEvent): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(event.payloadJson);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function tokenSignature(value: string): string {
  return value.replace(/\s+/g, "").replace(/\/\/.*$|#.*$/gm, "");
}

export function summarizeSession(startedAt: Date, events: StoredEvent[], finalCode: string | null): SessionSummary {
  const ordered = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const end = ordered.at(-1)?.timestamp ?? new Date();
  const totalDurationSeconds = Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 1000));
  const idleSeconds = ordered.filter((event) => event.type === "IDLE_GAP")
    .reduce((sum, event) => sum + Number(payload(event).durationSeconds ?? 0), 0);
  const edits = ordered.filter((event) => event.type === "CODE_EDIT");
  const meaningfulEdits = edits.filter((event) => {
    const data = payload(event);
    return tokenSignature(String(data.before ?? "")) !== tokenSignature(String(data.after ?? ""));
  });
  const aiResponseCategories: Record<string, number> = {};
  for (const event of ordered.filter((item) => item.type === "AI_RESPONSE")) {
    const category = String(payload(event).category ?? "UNCLASSIFIED");
    aiResponseCategories[category] = (aiResponseCategories[category] ?? 0) + 1;
  }
  const pastedMatchingAi = ordered.filter((event) => event.type === "CODE_PASTED")
    .reduce((sum, event) => sum + (payload(event).matchesRecentAi === true ? String(payload(event).content ?? "").length : 0), 0);
  const testRuns = ordered.filter((event) => event.type === "TEST_RUN");
  const firstPassingRun = testRuns.find((event) => payload(event).allPassed === true);
  let failureFixCycles = 0;
  const struggles: SessionSummary["struggleSegments"] = [];
  let pendingFailure: { testName: string; timestamp: Date; diffs: string[]; count: number } | undefined;
  for (const event of ordered) {
    const data = payload(event);
    if (event.type === "TEST_RUN" && data.allPassed !== true) {
      const testName = String(data.failedTest ?? "unknown");
      if (!pendingFailure || pendingFailure.testName !== testName) pendingFailure = { testName, timestamp: event.timestamp, diffs: [], count: 0 };
      pendingFailure.count += 1;
    } else if (event.type === "CODE_EDIT" && pendingFailure) {
      pendingFailure.diffs.push(String(data.diff ?? ""));
    } else if (event.type === "TEST_RUN" && data.allPassed === true && pendingFailure) {
      failureFixCycles += 1;
      if (pendingFailure.count >= 2) struggles.push({ testName: pendingFailure.testName, startedAt: pendingFailure.timestamp.toISOString(), endedAt: event.timestamp.toISOString(), failedRuns: pendingFailure.count, fixingDiffs: pendingFailure.diffs.slice(-5) });
      pendingFailure = undefined;
    }
  }
  return {
    totalDurationSeconds,
    activeDurationSeconds: Math.max(0, totalDurationSeconds - idleSeconds),
    editCount: edits.length,
    meaningfulEditRatio: edits.length === 0 ? 0 : Number((meaningfulEdits.length / edits.length).toFixed(2)),
    promptCount: ordered.filter((event) => event.type === "PROMPT_SENT").length,
    aiResponseCategories,
    pastedCharRatio: finalCode?.length ? Number(Math.min(1, pastedMatchingAi / finalCode.length).toFixed(2)) : 0,
    testRunCount: testRuns.length,
    firstPassTimestamp: firstPassingRun?.timestamp.toISOString() ?? null,
    failureFixCycles,
    struggleSegments: struggles
  };
}
