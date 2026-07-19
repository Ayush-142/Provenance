Build "Provenance" — a process-based assessment platform for coding assignments in the age of AI.

## Problem context
Students can now generate perfect assignment solutions with one LLM prompt, and plagiarism detectors (MOSS-style) cannot detect AI-generated code. Provenance does not fight AI use — it instruments it. Students solve assignments in a browser IDE with an AI tutor built in. Every action (edits, prompts, test runs, accepted suggestions) is logged as an event timeline. An assessment agent then analyzes the timeline to produce a process report, a learning score, and a personalized viva — so instructors grade the learning process, not the final code.

## Tech stack
- Frontend: React + Vite + TypeScript, Monaco Editor for the IDE, TailwindCSS
- Backend: Node.js + Express + TypeScript
- Database: SQLite via Prisma (keep it simple, single-file DB)
- Code execution: run submitted code server-side in a child process with a hard 5s timeout and stdin/stdout piping (Python and C++ support; demo scope, no Docker needed)
- AI: OpenAI API, GPT 5.6, two distinct agents (Tutor Agent and Assessor Agent)

## Core architecture — three parts

### 1. Student Workspace (frontend)
A single-page IDE view for solving one assignment:
- Left panel: assignment statement (markdown-rendered) with sample test cases
- Center: Monaco editor with language selector (Python/C++)
- Right panel: AI Tutor chat (streaming responses)
- Bottom: test runner output (run against visible test cases + hidden test cases on submit)
- A session timer starts when the workspace opens

Every user action emits an event to the backend via a batched event API (flush every 5s or 20 events):
Event types: SESSION_START, CODE_EDIT (store diff, not full snapshot, using diff-match-patch; full snapshot every 25 edits as a keyframe), PROMPT_SENT (full prompt text), AI_RESPONSE (full response text), CODE_PASTED (fires when a paste insertion > 40 chars occurs; store pasted content and whether it fuzzy-matches recent AI responses), TEST_RUN (which tests passed/failed), SUBMIT, IDLE_GAP (no events for > 90s, store duration).

### 2. Tutor Agent (backend)
- Endpoint: POST /api/sessions/:id/chat (streamed)
- System prompt: a Socratic CS tutor. It helps with concepts, debugging, and hints. It is ALLOWED to write code if the student insists — the platform's philosophy is "allowed but instrumented," so never refuse; the logging is the accountability layer.
- Context window per request: assignment statement + current editor code + last 10 chat turns.
- Tag each AI response server-side with a category using a cheap classification call: {CONCEPTUAL_HELP, DEBUG_HELP, PARTIAL_CODE, FULL_SOLUTION}. Store the tag on the AI_RESPONSE event.

### 3. Assessor Agent (backend) — the core of the product
Triggered on SUBMIT. Endpoint: POST /api/sessions/:id/assess.

Step A — deterministic pre-processing (pure TypeScript, no LLM):
Reduce the raw event stream into a structured SessionSummary JSON:
- totalDuration, activeDuration (minus idle gaps)
- editCount, meaningful edit ratio (edits that changed AST-level tokens vs whitespace)
- promptCount, breakdown of AI response categories
- pastedCharRatio: % of final code that arrived via paste events matching AI responses (compute with fuzzy substring matching over the final submission)
- testRunCount, firstPassTimestamp, failure→fix cycles (test failed, edits occurred, same test passed)
- struggleSegments: time windows with repeated test failures on the same test case, including the code diffs that eventually fixed them

Step B — LLM analysis:
Send SessionSummary + assignment statement + final code + the 5 most significant diffs + full prompt/response transcript to GPT 5.6 with a system prompt instructing it to return STRICT JSON:
{
  "processNarrative": "3-5 sentence story of how this student worked",
  "learningSignals": [{ "signal": string, "evidence": string }],
  "concernSignals": [{ "signal": string, "evidence": string }],
  "authorshipScore": 0-100,   // how much of the reasoning was demonstrably the student's
  "engagementScore": 0-100,   // iteration, debugging, conceptual questioning
  "vivaQuestions": [           // exactly 4, each anchored to a SPECIFIC moment in THIS session
    { "question": string, "anchor": "what session moment this derives from", "expectedUnderstanding": string }
  ]
}
Validate the JSON against a zod schema; retry once with the validation error appended if parsing fails.

### 4. Instructor Dashboard (frontend)
- Route /instructor: table of all sessions (student name, assignment, duration, authorship score, engagement score, status)
- Session detail view, three tabs:
  a) Report: the narrative, signals with evidence, both scores as gauges, viva questions as printable cards
  b) Timeline: horizontal visual timeline of the session — colored blocks for editing / AI chat / test runs / idle, clickable to inspect the underlying events (show prompt text, diffs)
  c) Replay: step through code keyframes with a slider to watch the solution evolve

## Data model (Prisma)
Assignment(id, title, statementMd, language, visibleTests JSON, hiddenTests JSON)
Session(id, studentName, assignmentId, startedAt, submittedAt, finalCode, status)
Event(id, sessionId, type, timestamp, payload JSON)
Assessment(id, sessionId, summaryJson, reportJson, authorshipScore, engagementScore)

## Seed data (critical for the demo)
Seed one assignment ("Longest Substring Without Repeating Characters", Python) and TWO pre-recorded sessions with identical final code:
- Session A "genuine": 40 min, 25 edits, 6 conceptual prompts, 3 failure→fix cycles, low paste ratio
- Session B "outsourced": 4 min, 1 prompt ("solve this"), one large paste, 1 test run, submit
Write a seed script that inserts realistic event streams for both so the dashboard demo works with zero live interaction, then run the Assessor on both at seed time.

## API surface
POST /api/sessions (create), POST /api/sessions/:id/events (batch ingest), POST /api/sessions/:id/chat, POST /api/sessions/:id/run (execute tests), POST /api/sessions/:id/submit (runs hidden tests + triggers assessment), GET /api/sessions, GET /api/sessions/:id (events + assessment), GET /api/assignments/:id

## Non-goals (do not build)
Auth, multi-classroom management, multiple assignments UI, mobile layout, Docker sandboxing, payment. Single instructor, single assignment, demo-grade.

## Quality bar
- TypeScript strict mode everywhere, shared types package between client/server for Event and Assessment shapes
- The Assessor's zod schemas are the contract; no untyped JSON handling
- README with setup steps (env var OPENAI_API_KEY, npm run seed, npm run dev) and a 60-second demo script walking through the split comparison of Session A vs B