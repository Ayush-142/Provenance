import { z } from "zod";

export const eventTypes = [
  "SESSION_START", "CODE_EDIT", "PROMPT_SENT", "AI_RESPONSE",
  "CODE_PASTED", "TEST_RUN", "SUBMIT", "IDLE_GAP"
] as const;

export type EventType = (typeof eventTypes)[number];

export interface TestCase {
  input: string;
  expected: number;
}

export interface AssignmentTests {
  visible: TestCase[];
  hidden: TestCase[];
}

export interface SessionSummary {
  totalDurationSeconds: number;
  activeDurationSeconds: number;
  editCount: number;
  meaningfulEditRatio: number;
  promptCount: number;
  aiResponseCategories: Record<string, number>;
  pastedCharRatio: number;
  testRunCount: number;
  firstPassTimestamp: string | null;
  failureFixCycles: number;
  struggleSegments: Array<{
    testName: string;
    startedAt: string;
    endedAt: string;
    failedRuns: number;
    fixingDiffs: string[];
  }>;
}

export interface RunResult {
  name: string;
  input: string;
  expected: number;
  actual: string;
  passed: boolean;
  error?: string;
}

export const assessmentReportSchema = z.object({
  processNarrative: z.string().min(1),
  learningSignals: z.array(z.object({ signal: z.string().min(1), evidence: z.string().min(1) })),
  concernSignals: z.array(z.object({ signal: z.string().min(1), evidence: z.string().min(1) })),
  authorshipScore: z.number().int().min(0).max(100),
  engagementScore: z.number().int().min(0).max(100),
  vivaQuestions: z.array(z.object({
    question: z.string().min(1),
    anchor: z.string().min(1),
    expectedUnderstanding: z.string().min(1)
  })).length(4)
});

export type AssessmentReport = z.infer<typeof assessmentReportSchema>;

export type SessionStatus = "IN_PROGRESS" | "SUBMITTED" | "ASSESSED";

export interface SessionListItem {
  id: string;
  studentName: string;
  assignmentTitle: string;
  startedAt: string;
  submittedAt: string | null;
  status: SessionStatus;
  authorshipScore: number | null;
  engagementScore: number | null;
}

export interface SessionEventRecord {
  id: string;
  type: EventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface SessionDetailResponse {
  id: string;
  studentName: string;
  status: SessionStatus;
  startedAt: string;
  submittedAt: string | null;
  finalCode: string | null;
  assignment: { id: string; title: string; statementMd: string; language: string };
  events: SessionEventRecord[];
  assessment: { summary: SessionSummary; report: AssessmentReport; authorshipScore: number; engagementScore: number } | null;
}
