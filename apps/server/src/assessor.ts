import { assessmentReportSchema, type AssessmentReport, type SessionSummary } from "@provenance/shared";
import { summarizeSession, type StoredEvent } from "./session-summary.js";
import { generateText } from "./ai-provider.js";

function payload(event: StoredEvent): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(event.payloadJson);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function significantDiffs(events: StoredEvent[], limit = 5): string[] {
  return events
    .filter((event) => event.type === "CODE_EDIT")
    .map((event) => String(payload(event).diff ?? ""))
    .filter((diff) => diff.length > 0)
    .sort((a, b) => b.length - a.length)
    .slice(0, limit);
}

function transcript(events: StoredEvent[]): string {
  const lines = events
    .filter((event) => event.type === "PROMPT_SENT" || event.type === "AI_RESPONSE")
    .map((event) => {
      const data = payload(event);
      const text = String(data.text ?? "");
      return event.type === "PROMPT_SENT" ? `Student: ${text}` : `Tutor [${String(data.category ?? "UNCLASSIFIED")}]: ${text}`;
    });
  return lines.join("\n\n");
}

const SYSTEM_PROMPT = `You are the Assessor Agent inside Provenance, a process-based assessment platform for coding assignments. You are given the deterministic record of how a student worked on an assignment (a session summary, their most significant code diffs, and their full transcript with an AI tutor), plus the assignment statement and their final code.

Judge the PROCESS, not the code quality: how much of the reasoning was demonstrably the student's own, how they iterated, debugged, and engaged with concepts versus how much looks outsourced to the AI tutor or pasted in wholesale.

Return STRICT JSON only — no markdown code fences, no prose outside the JSON, no extra keys — matching exactly this shape:
{
  "processNarrative": string (3-5 sentences telling the story of how this specific student worked),
  "learningSignals": [{ "signal": string, "evidence": string }],
  "concernSignals": [{ "signal": string, "evidence": string }],
  "authorshipScore": number 0-100 (how much of the reasoning was demonstrably the student's),
  "engagementScore": number 0-100 (iteration, debugging, conceptual questioning),
  "vivaQuestions": exactly 4 items, each { "question": string, "anchor": string, "expectedUnderstanding": string }
}
Every viva question's "anchor" must point to a SPECIFIC moment in THIS session (a diff, a prompt, a struggle segment, a timestamp) — never ask a generic question that could apply to any submission.`;

function buildUserContent(input: { statement: string; finalCode: string; summary: SessionSummary; diffs: string[]; transcript: string }): string {
  return [
    "Assignment statement:",
    input.statement,
    "",
    "Final submitted code:",
    input.finalCode,
    "",
    "Deterministic session summary (JSON):",
    JSON.stringify(input.summary, null, 2),
    "",
    "The most significant code diffs made during the session:",
    input.diffs.length ? input.diffs.map((diff, index) => `Diff ${index + 1}:\n${diff}`).join("\n\n") : "(none recorded)",
    "",
    "Full prompt/response transcript with the AI tutor:",
    input.transcript || "(the student never used the AI tutor)"
  ].join("\n");
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}

function parseReport(raw: string): { success: true; data: AssessmentReport } | { success: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(raw));
  } catch (error) {
    return { success: false, error: `Response was not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const result = assessmentReportSchema.safeParse(json);
  return result.success ? { success: true, data: result.data } : { success: false, error: result.error.message };
}

async function requestReport(instructions: string, userContent: string): Promise<string> {
  return generateText({ model: "gpt-5.6", instructions, input: userContent, jsonMode: true });
}

export async function assessSession(input: { statement: string; finalCode: string; events: StoredEvent[]; startedAt: Date }): Promise<{ summary: SessionSummary; report: AssessmentReport }> {
  const summary = summarizeSession(input.startedAt, input.events, input.finalCode);
  const userContent = buildUserContent({ statement: input.statement, finalCode: input.finalCode, summary, diffs: significantDiffs(input.events), transcript: transcript(input.events) });

  const first = parseReport(await requestReport(SYSTEM_PROMPT, userContent));
  if (first.success) return { summary, report: first.data };

  const retryInstructions = `${SYSTEM_PROMPT}\n\nYour previous response failed schema validation with this error:\n${first.error}\n\nReturn corrected STRICT JSON only.`;
  const retried = parseReport(await requestReport(retryInstructions, userContent));
  if (retried.success) return { summary, report: retried.data };

  throw new Error(`Assessor response failed validation twice: ${retried.error}`);
}
