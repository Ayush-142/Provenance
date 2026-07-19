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
