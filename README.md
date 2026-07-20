# Provenance

A process-based assessment platform for coding assignments in the age of AI.

Students solve assignments in a browser IDE with an AI tutor built in. Every action — edits, prompts, test runs, pasted code — is logged as an event timeline. On submit, an Assessor Agent analyzes that timeline (not just the final code) to produce a process narrative, an authorship/engagement score, and four session-specific viva questions, so instructors can grade *how* a student worked, not just *what* they turned in.

See [plan.md](plan.md) for the full product spec.

## Tech stack

- **Frontend**: React + Vite + TypeScript, Monaco Editor, Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite via Prisma
- **Code execution**: submitted code runs server-side in a child process with a 5s timeout (Python and C++)
- **AI**: two agents — a Socratic Tutor (streamed chat) and an Assessor (structured JSON report, validated with zod)

## Prerequisites

- Node.js 20+
- Python 3 on `PATH` (required — the seeded assignment and the code runner both use it)
- `g++` on `PATH` (only needed if you add a C++ assignment; not required for the seeded demo)

## Setup

1. **Install dependencies**

   ```
   npm install
   ```

2. **Configure environment variables** — copy `.env.example` to `.env` in the repo root:

   ```
   DATABASE_URL="file:./provenance.db"
   OPENAI_API_KEY="sk-..."
   ```

   `OPENAI_API_KEY` accepts either a real OpenAI key (starts with `sk-`, routes through the OpenAI SDK) **or** a Google Gemini API key (routes through Gemini instead) — the server auto-detects which one you gave it by its shape. This means you can develop against Gemini today and drop in an OpenAI key later with zero code changes.

3. **Set up the database and seed demo data**

   ```
   npm run seed
   ```

   This creates the SQLite database, seeds the one assignment ("Longest Substring Without Repeating Characters", Python), and inserts two fully-formed pre-recorded sessions with identical final code — then runs the real Assessor Agent on both, so the dashboard has real, populated reports without any live interaction. Expect this to take ~1–2 minutes (it makes ~12 real LLM calls and spawns real Python processes to validate the recorded test runs).

4. **Run the app**

   ```
   npm run dev
   ```

   - Student workspace: http://localhost:5173/
   - Instructor dashboard: http://localhost:5173/instructor

## Other scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs client (Vite) and server (Express, via `tsx watch`) concurrently |
| `npm run seed` | Generates the Prisma client, pushes the schema, and seeds assignment + demo sessions |
| `npm run check` | Type-checks all workspaces (`tsc --noEmit`) |
| `npm run build` | Production build of all workspaces |
| `npm run db:generate` / `npm run db:push` / `npm run db:migrate` | Prisma commands, if you need them individually |

## 60-second demo script

1. Open **http://localhost:5173/instructor**. You'll see two submitted, fully-assessed sessions on the same assignment with identical final code — but wildly different scores.
2. Click into **Priya Nair** (the "genuine" session, ~39 minutes).
   - **Report tab**: authorship ~92, engagement ~96. The narrative correctly reconstructs her actual bug history — comparing `len(sub)` to `len(s)` by mistake, debugging a sliding-window pointer bug with print statements — and the four viva questions are anchored to those exact moments (e.g. "In your early brute-force code, you checked `len(set(sub)) == len(s)`. Why did that cause your function to return 0?").
   - **Timeline tab**: click through the colored blocks — teal edits, purple AI chat, cyan test runs, one small orange paste — to see the underlying prompt text, diffs, and test results at each moment.
   - **Replay tab**: drag the slider to watch the solution evolve from the starter stub through three bugs to the final sliding-window implementation.
3. Go back and click into **Jordan Blake** (the "outsourced" session, ~4 minutes).
   - **Report tab**: authorship 0, engagement 0, three concern signals, zero learning signals. The narrative: one prompt ("solve this"), one large paste of a complete solution, two test runs, submit.
   - **Timeline tab**: the entire session is four events wide.
4. The punchline: **both sessions produced the exact same final code and would score identically on any output-only grader.** The process timeline is what tells them apart.

## Non-goals

Auth, multi-classroom management, multiple assignments, mobile layout, Docker sandboxing, payments. This is a single-instructor, single-assignment, demo-grade build.
