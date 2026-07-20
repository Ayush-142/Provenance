import "dotenv/config";
import { PrismaClient, type EventType } from "@prisma/client";
import { diff_match_patch } from "diff-match-patch";
import type { TestCase } from "@provenance/shared";
import { runCode } from "../src/runner.js";
import { assessSession } from "../src/assessor.js";

const prisma = new PrismaClient();
const dmp = new diff_match_patch();

const ASSIGNMENT_ID = "longest-substring-python";

const statementMd = `# Longest Substring Without Repeating Characters

Given a string \`s\`, return the length of its longest substring containing no repeated characters.

## Examples

- \`s = "abcabcbb"\` → \`3\` (\`"abc"\`)
- \`s = "bbbbb"\` → \`1\` (\`"b"\`)
- \`s = "pwwkew"\` → \`3\` (\`"wke"\`)
`;

const visibleTests: TestCase[] = [
  { input: "abcabcbb", expected: 3 },
  { input: "bbbbb", expected: 1 },
  { input: "pwwkew", expected: 3 }
];

const hiddenTests: TestCase[] = [
  { input: "", expected: 0 },
  { input: "dvdf", expected: 3 }
];

async function seedAssignment(): Promise<void> {
  await prisma.assignment.upsert({
    where: { id: ASSIGNMENT_ID },
    update: {},
    create: {
      id: ASSIGNMENT_ID,
      title: "Longest Substring Without Repeating Characters",
      statementMd,
      language: "python",
      visibleTestsJson: JSON.stringify(visibleTests),
      hiddenTestsJson: JSON.stringify(hiddenTests)
    }
  });
  console.log("Seeded assignment: Longest Substring Without Repeating Characters");
}

// ---- Shared final solution, identical in both demo sessions ----

const FINAL_PY_CODE = `def longest_unique_substring(s: str) -> int:
    last_index = {}
    left = 0
    longest = 0
    for right, char in enumerate(s):
        if char in last_index and last_index[char] >= left:
            left = last_index[char] + 1
        last_index[char] = right
        longest = max(longest, right - left + 1)
    return longest

print(longest_unique_substring(input()))
`;

const STARTER_PY_CODE = `# Read one string from stdin and print the answer
def longest_unique_substring(s: str) -> int:
    # Start here
    return 0

print(longest_unique_substring(input()))
`;

// ---- Timeline helper: builds a realistic, replayable event stream ----

interface DraftEvent { type: EventType; timestamp: Date; payloadJson: string; }

class Timeline {
  private cursor: Date;
  private editCount = 0;
  events: DraftEvent[] = [];

  constructor(startedAt: Date) {
    this.cursor = new Date(startedAt);
  }

  advance(seconds: number): void {
    this.cursor = new Date(this.cursor.getTime() + seconds * 1000);
  }

  private push(type: EventType, payload: Record<string, unknown>): void {
    this.events.push({ type, timestamp: new Date(this.cursor), payloadJson: JSON.stringify(payload) });
  }

  start(): void {
    this.push("SESSION_START", {});
  }

  idle(seconds: number): void {
    this.advance(seconds);
    this.push("IDLE_GAP", { durationSeconds: seconds });
  }

  edit(before: string, after: string): void {
    this.editCount += 1;
    const diff = dmp.diff_main(before, after);
    dmp.diff_cleanupSemantic(diff);
    this.push("CODE_EDIT", { diff: dmp.diff_toDelta(diff), before, after, keyframe: this.editCount % 25 === 0 ? after : undefined });
  }

  paste(content: string, matchesRecentAi: boolean): void {
    this.push("CODE_PASTED", { content, matchesRecentAi });
  }

  prompt(text: string): void {
    this.push("PROMPT_SENT", { text });
  }

  response(text: string, category: string): void {
    this.push("AI_RESPONSE", { text, category });
  }

  async testRun(code: string, tests: TestCase[], hidden = false): Promise<{ allPassed: boolean; passedCount: number; total: number }> {
    const results = await runCode("python", code, tests);
    const passedCount = results.filter((result) => result.passed).length;
    const allPassed = passedCount === results.length;
    this.push("TEST_RUN", { hidden, allPassed, failedTest: results.find((result) => !result.passed)?.name, results });
    return { allPassed, passedCount, total: results.length };
  }

  submit(hiddenPassed: number, hiddenTotal: number): void {
    this.push("SUBMIT", { hiddenPassed, hiddenTotal });
  }
}

// ---- Session A: "genuine" — 40 minutes of real iteration ----

async function seedGenuineSession(): Promise<void> {
  const sessionId = "demo-session-genuine";
  await prisma.session.deleteMany({ where: { id: sessionId } });

  const startedAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
  const tl = new Timeline(startedAt);
  tl.start();

  const states = [
    STARTER_PY_CODE, // 0
    `# Read one string from stdin and print the answer
def longest_unique_substring(s: str) -> int:
    # plan: try every substring, check uniqueness, keep the longest (brute force first)
    return 0

print(longest_unique_substring(input()))
`, // 1
    `def longest_unique_substring(s: str) -> int:
    best = 0
    for i in range(len(s)):
        pass
    return best

print(longest_unique_substring(input()))
`, // 2
    `def longest_unique_substring(s: str) -> int:
    best = 0
    for i in range(len(s)):
        for j in range(i, len(s)):
            pass
    return best

print(longest_unique_substring(input()))
`, // 3
    `def longest_unique_substring(s: str) -> int:
    best = 0
    for i in range(len(s)):
        for j in range(i, len(s)):
            sub = s[i:j + 1]
            if len(set(sub)) == len(s):
                best = max(best, len(sub))
    return best

print(longest_unique_substring(input()))
`, // 4 - BUG 1: compares to len(s) instead of len(sub)
    `def longest_unique_substring(s: str) -> int:
    best = 0
    for i in range(len(s)):
        for j in range(i, len(s)):
            sub = s[i:j + 1]
            # why is this always 0 on the sample cases?
            if len(set(sub)) == len(s):
                best = max(best, len(sub))
    return best

print(longest_unique_substring(input()))
`, // 5
    `def longest_unique_substring(s: str) -> int:
    best = 0
    for i in range(len(s)):
        for j in range(i, len(s)):
            sub = s[i:j + 1]
            if len(set(sub)) == len(sub):
                best = max(best, len(sub))
    return best

print(longest_unique_substring(input()))
`, // 6 - BUG 1 fixed, brute force correct
    `def longest_unique_substring(s: str) -> int:
    # tutor suggested a sliding window with a dict of last-seen indices instead of checking every substring
    best = 0
    for i in range(len(s)):
        for j in range(i, len(s)):
            sub = s[i:j + 1]
            if len(set(sub)) == len(sub):
                best = max(best, len(sub))
    return best

print(longest_unique_substring(input()))
`, // 7
    `def longest_unique_substring(s: str) -> int:
    seen = {}
    left = 0
    best = 0
    for right, ch in enumerate(s):
        if ch in seen:
            left = seen[ch]
        seen[ch] = right
        best = max(best, right - left + 1)
    return best

print(longest_unique_substring(input()))
`, // 8 - BUG 2: missing +1 and missing left-bound guard
    `def longest_unique_substring(s: str) -> int:
    seen = {}
    left = 0
    best = 0
    for right, ch in enumerate(s):
        if ch in seen:
            left = seen[ch]
        seen[ch] = right
        best = max(best, right - left + 1)
        # print(right, ch, left, best)
    return best

print(longest_unique_substring(input()))
`, // 9
    `def longest_unique_substring(s: str) -> int:
    seen = {}
    left = 0
    best = 0
    for right, ch in enumerate(s):
        if ch in seen and seen[ch] >= left:
            left = seen[ch] + 1
        seen[ch] = right
        best = max(best, right - left + 1)
    return best

print(longest_unique_substring(input()))
`, // 10 - BUG 2 fixed, sliding window correct
    `def longest_unique_substring(s: str) -> int:
    seen = {}
    left = 0
    best = 0
    text = input()
    for right, ch in enumerate(text):
        if ch in seen and seen[ch] >= left:
            left = seen[ch] + 1
        seen[ch] = right
        best = max(best, right - left + 1)
    return best

print(longest_unique_substring())
`, // 11 - BUG 3: refactored input handling, forgot to pass the argument (crashes)
    `def longest_unique_substring(s: str) -> int:
    seen = {}
    left = 0
    best = 0
    text = input()
    for right, ch in enumerate(text):
        if ch in seen and seen[ch] >= left:
            left = seen[ch] + 1
        seen[ch] = right
        best = max(best, right - left + 1)
    return best

print(longest_unique_substring())  # TypeError: missing 1 required positional argument
`, // 12
    FINAL_PY_CODE // 13 - BUG 3 fixed, variables renamed for clarity
  ];

  tl.advance(15); tl.edit(states[0], states[1]);
  tl.advance(20); tl.edit(states[1], states[2]);
  tl.advance(25); tl.edit(states[2], states[3]);
  tl.advance(10); tl.prompt("How should I think about approaching this problem? I'm not sure where to start.");
  tl.advance(25); tl.response("Start with the simplest thing you can reason about: for every possible substring, can you check whether it has repeated characters? Get that working first, then we can talk about making it faster.", "CONCEPTUAL_HELP");
  tl.advance(40); tl.edit(states[3], states[4]);
  await tl.testRun(states[4], visibleTests);
  tl.advance(50); tl.edit(states[4], states[5]);
  await tl.testRun(states[5], visibleTests);
  tl.advance(15); tl.prompt("My brute force keeps returning 0 for every input. What's a good way to reason about where the bug might be?");
  tl.advance(30); tl.response("Walk through one small example by hand: for \"abc\", what should len(set(sub)) equal, and what should it be compared against? You're comparing it to something that doesn't change per substring — that's a hint about where to look.", "CONCEPTUAL_HELP");
  tl.advance(60); tl.edit(states[5], states[6]);
  await tl.testRun(states[6], visibleTests);
  tl.idle(112);
  tl.advance(20); tl.prompt("That passes now. Is there a way to avoid checking every substring? I've heard of something called a sliding window.");
  tl.advance(35); tl.response("Yes — instead of re-scanning, keep a window [left, right] that always has unique characters, and remember the last index you saw each character at. When you see a repeat inside the window, move left forward past that old index.", "CONCEPTUAL_HELP");
  tl.advance(45); tl.edit(states[6], states[7]);
  tl.advance(70); tl.edit(states[7], states[8]);
  await tl.testRun(states[8], visibleTests);
  tl.advance(15); tl.prompt("How do I know exactly when and how far to move the left pointer in a sliding window approach?");
  tl.advance(30); tl.response("Move left only when the repeated character's last-seen index is inside your current window (>= left), and move it to one past that index: `left = last_index[char] + 1`. If the last-seen index is before left, it's already outside the window and doesn't matter.", "CONCEPTUAL_HELP");
  tl.advance(50); tl.edit(states[8], states[9]);
  await tl.testRun(states[9], visibleTests);
  tl.advance(60); tl.edit(states[9], states[10]);
  const cycle2Fix = await tl.testRun(states[10], visibleTests);
  if (!cycle2Fix.allPassed) throw new Error("Seed narrative assumption broke: sliding window fix (state 10) should pass visible tests.");
  tl.advance(10); tl.paste("if char in last_index and last_index[char] >= left:", true);
  tl.advance(30); tl.edit(states[10], states[11]);
  await tl.testRun(states[11], visibleTests);
  tl.advance(15); tl.prompt("It crashed after I refactored how I read input. What's a good way to structure that entry point so I don't break the function call?");
  tl.advance(30); tl.response("Keep the function pure — it should only take the string it's supposed to process as a parameter. Do the input reading right where you call it, e.g. `print(longest_unique_substring(input()))`, so there's only one place that can get out of sync.", "CONCEPTUAL_HELP");
  tl.advance(45); tl.edit(states[11], states[12]);
  await tl.testRun(states[12], visibleTests);
  tl.advance(55); tl.edit(states[12], states[13]);
  const cycle3Fix = await tl.testRun(states[13], visibleTests);
  if (!cycle3Fix.allPassed) throw new Error("Seed narrative assumption broke: final fix (state 13) should pass visible tests.");
  tl.idle(95);
  tl.advance(20); tl.prompt("Is my final solution's time complexity actually O(n)? How would I explain that in a viva?");
  tl.advance(35); tl.response("Yes — each character is added to the dict and potentially causes `left` to move forward, but `left` only ever moves forward, never back. So across the whole run, right and left each advance at most n times total, giving O(n) overall.", "CONCEPTUAL_HELP");

  let polished = states[13];
  for (let i = 0; i < 12; i += 1) {
    tl.advance(100);
    const next = i % 2 === 0 ? `${FINAL_PY_CODE}\n` : FINAL_PY_CODE;
    tl.edit(polished, next);
    polished = next;
  }

  tl.advance(50);
  await tl.testRun(polished, visibleTests);
  tl.advance(35);

  const hidden = await tl.testRun(polished, hiddenTests, true);
  tl.submit(hidden.passedCount, hidden.total);

  await createSessionWithEvents({
    id: sessionId,
    studentName: "Priya Nair",
    startedAt,
    finalCode: polished,
    events: tl.events
  });

  console.log(`Seeded session A (genuine): ${tl.events.length} events, ${tl.events.filter((e) => e.type === "CODE_EDIT").length} edits.`);
}

// ---- Session B: "outsourced" — 4 minutes, one prompt, one paste ----

async function seedOutsourcedSession(): Promise<void> {
  const sessionId = "demo-session-outsourced";
  await prisma.session.deleteMany({ where: { id: sessionId } });

  const startedAt = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const tl = new Timeline(startedAt);
  tl.start();

  tl.advance(20);
  tl.prompt("solve this");
  tl.advance(25);
  tl.response(
    `Here's a full solution using a sliding window:\n\n\`\`\`python\n${FINAL_PY_CODE}\`\`\`\n\nIt tracks the last-seen index of each character and moves the left edge of the window forward whenever a repeat falls inside it, giving O(n) time.`,
    "FULL_SOLUTION"
  );
  tl.advance(5);
  tl.paste(FINAL_PY_CODE, true);
  tl.advance(2);
  tl.edit(STARTER_PY_CODE, FINAL_PY_CODE);
  tl.advance(130);
  await tl.testRun(FINAL_PY_CODE, visibleTests);
  tl.advance(50);

  const hidden = await tl.testRun(FINAL_PY_CODE, hiddenTests, true);
  tl.submit(hidden.passedCount, hidden.total);

  await createSessionWithEvents({
    id: sessionId,
    studentName: "Jordan Blake",
    startedAt,
    finalCode: FINAL_PY_CODE,
    events: tl.events
  });

  console.log(`Seeded session B (outsourced): ${tl.events.length} events.`);
}

// ---- Persistence + assessment ----

async function createSessionWithEvents(input: { id: string; studentName: string; startedAt: Date; finalCode: string; events: DraftEvent[] }): Promise<void> {
  const submittedAt = input.events.find((event) => event.type === "SUBMIT")?.timestamp ?? new Date();

  await prisma.session.create({
    data: {
      id: input.id,
      studentName: input.studentName,
      assignmentId: ASSIGNMENT_ID,
      startedAt: input.startedAt,
      submittedAt,
      finalCode: input.finalCode,
      status: "SUBMITTED",
      events: { create: input.events }
    }
  });

  const assignment = await prisma.assignment.findUniqueOrThrow({ where: { id: ASSIGNMENT_ID } });
  const { summary, report } = await assessSession({ statement: assignment.statementMd, finalCode: input.finalCode, events: input.events, startedAt: input.startedAt });

  await prisma.assessment.upsert({
    where: { sessionId: input.id },
    create: { sessionId: input.id, summaryJson: JSON.stringify(summary), reportJson: JSON.stringify(report), authorshipScore: report.authorshipScore, engagementScore: report.engagementScore },
    update: { summaryJson: JSON.stringify(summary), reportJson: JSON.stringify(report), authorshipScore: report.authorshipScore, engagementScore: report.engagementScore }
  });
  await prisma.session.update({ where: { id: input.id }, data: { status: "ASSESSED" } });

  console.log(`Assessed ${input.id}: authorship=${report.authorshipScore} engagement=${report.engagementScore}`);
}

async function main(): Promise<void> {
  await seedAssignment();
  await seedGenuineSession();
  await seedOutsourcedSession();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
