import { Editor, type OnMount } from "@monaco-editor/react";
import { diff_match_patch } from "diff-match-patch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssessmentReport, EventType, RunResult, TestCase } from "@provenance/shared";

type Assignment = { id: string; title: string; statementMd: string; language: "python" | "cpp"; visibleTests: TestCase[] };
type QueuedEvent = { type: EventType; timestamp: string; payload: Record<string, unknown> };

const fallbackAssignment: Assignment = {
  id: "longest-substring-python",
  title: "Longest Substring Without Repeating Characters",
  language: "python",
  statementMd: "Given a string `s`, return the length of its longest substring without repeated characters.",
  visibleTests: [{ input: "abcabcbb", expected: 3 }, { input: "bbbbb", expected: 1 }, { input: "pwwkew", expected: 3 }]
};

const starterCode = `# Read one string from stdin and print the answer\ndef longest_unique_substring(s: str) -> int:\n    # Start here\n    return 0\n\nprint(longest_unique_substring(input()))\n`;

function formatDuration(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function Workspace(): JSX.Element {
  const [assignment, setAssignment] = useState<Assignment>(fallbackAssignment);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState(starterCode);
  const [language, setLanguage] = useState<"python" | "cpp">("python");
  const [elapsed, setElapsed] = useState(0);
  const [output, setOutput] = useState<RunResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [tutorMessage, setTutorMessage] = useState("");
  const [chat, setChat] = useState<Array<{ role: "student" | "tutor"; text: string; category?: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<{ hiddenResults: RunResult[]; report: AssessmentReport } | null>(null);
  const queue = useRef<QueuedEvent[]>([]);
  const lastCode = useRef(code);
  const editCount = useRef(0);
  const lastActivity = useRef(Date.now());
  const recentAiResponses = useRef<string[]>([]);
  const dmp = useMemo(() => new diff_match_patch(), []);

  const enqueue = useCallback((type: EventType, payload: Record<string, unknown>) => {
    queue.current.push({ type, timestamp: new Date().toISOString(), payload });
    if (queue.current.length >= 20) void flush();
  // flush is intentionally declared below; it only executes after the component has initialized.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const flush = useCallback(async () => {
    if (!sessionId || queue.current.length === 0) return;
    const events = queue.current.splice(0);
    try {
      await fetch(`/api/sessions/${sessionId}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }) });
    } catch {
      queue.current.unshift(...events);
    }
  }, [sessionId]);

  useEffect(() => {
    void (async () => {
      try {
        const [assignmentResponse, sessionResponse] = await Promise.all([
          fetch(`/api/assignments/${fallbackAssignment.id}`),
          fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentName: "Demo Student", assignmentId: fallbackAssignment.id }) })
        ]);
        if (assignmentResponse.ok) setAssignment(await assignmentResponse.json() as Assignment);
        if (sessionResponse.ok) setSessionId((await sessionResponse.json() as { id: string }).id);
      } catch { /* The workspace stays usable in offline visual-demo mode. */ }
    })();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => { setElapsed((value) => value + 1); void flush(); }, 5_000);
    return () => window.clearInterval(interval);
  }, [flush]);

  useEffect(() => {
    const activity = () => { lastActivity.current = Date.now(); };
    const idleCheck = window.setInterval(() => {
      const idleSeconds = Math.floor((Date.now() - lastActivity.current) / 1000);
      if (idleSeconds >= 90) { enqueue("IDLE_GAP", { durationSeconds: idleSeconds }); lastActivity.current = Date.now(); }
    }, 15_000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    return () => { window.clearInterval(idleCheck); window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); };
  }, [enqueue]);

  const onCodeChange = (value: string | undefined) => {
    const nextCode = value ?? "";
    const diff = dmp.diff_main(lastCode.current, nextCode);
    dmp.diff_cleanupSemantic(diff);
    editCount.current += 1;
    enqueue("CODE_EDIT", { diff: dmp.diff_toDelta(diff), before: lastCode.current, after: nextCode, keyframe: editCount.current % 25 === 0 ? nextCode : undefined });
    lastCode.current = nextCode;
    setCode(nextCode);
    lastActivity.current = Date.now();
  };

  const onEditorMount: OnMount = (editor) => {
    editor.onDidPaste((event) => {
      const pasted = editor.getModel()?.getValueInRange(event.range) ?? "";
      if (pasted.length > 40) {
        const normalizedPaste = pasted.replace(/\s+/g, "");
        const matchesRecentAi = recentAiResponses.current.some((response) => response.replace(/\s+/g, "").includes(normalizedPaste));
        enqueue("CODE_PASTED", { content: pasted, matchesRecentAi });
      }
    });
  };

  const runTests = async () => {
    if (!sessionId) { setOutput(assignment.visibleTests.map((test, index) => ({ name: `Test ${index + 1}`, input: test.input, expected: test.expected, actual: "", passed: false, error: "Server session is not connected yet." }))); return; }
    setIsRunning(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, language }) });
      const body = await response.json() as { results?: RunResult[]; error?: string };
      setOutput(body.results ?? [{ name: "Runner", input: "", expected: 0, actual: "", passed: false, error: body.error ?? "Could not run tests." }]);
    } finally { setIsRunning(false); }
  };

  const sendTutorMessage = async () => {
    const message = tutorMessage.trim();
    if (!message) return;
    if (!sessionId) { setChat((items) => [...items, { role: "student", text: message }, { role: "tutor", text: "The Tutor will connect once the server session is available." }]); return; }
    setChat((items) => [...items, { role: "student", text: message }, { role: "tutor", text: "" }]);
    setTutorMessage("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: message, code }) });
      if (!response.ok || !response.body) throw new Error("Tutor service is unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop() ?? "";
        for (const messageEvent of messages) {
          if (!messageEvent.startsWith("data: ")) continue;
          const event = JSON.parse(messageEvent.slice(6)) as { type: string; text?: string; category?: string; message?: string };
          if (event.type === "delta") { answer += event.text ?? ""; setChat((items) => [...items.slice(0, -1), { role: "tutor", text: answer }]); }
          if (event.type === "done") {
            setChat((items) => [...items.slice(0, -1), { role: "tutor", text: answer, category: event.category }]);
            recentAiResponses.current = [answer, ...recentAiResponses.current].slice(0, 5);
          }
          if (event.type === "error") throw new Error(event.message);
        }
      }
    } catch (error) {
      setChat((items) => [...items.slice(0, -1), { role: "tutor", text: error instanceof Error ? error.message : "Tutor request failed." }]);
    }
  };

  const submitAssignment = async () => {
    if (!sessionId || isSubmitting || submission) return;
    if (!window.confirm("Submit your solution? This runs the hidden tests and locks your session for assessment.")) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await flush();
      const response = await fetch(`/api/sessions/${sessionId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, language }) });
      const body = await response.json() as { hiddenResults?: RunResult[]; report?: AssessmentReport; error?: string };
      if (!response.ok || !body.hiddenResults || !body.report) throw new Error(body.error ?? "Submission failed.");
      setSubmission({ hiddenResults: body.hiddenResults, report: body.report });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return <div className="flex h-screen flex-col overflow-hidden">
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div><span className="text-lg font-black tracking-tight">provenance</span><span className="ml-3 rounded-full bg-teal/10 px-2.5 py-1 text-xs font-bold text-teal">STUDENT WORKSPACE</span></div>
      <div className="flex items-center gap-5 text-sm">
        {submitError && <span className="text-xs font-semibold text-rose-600">{submitError}</span>}
        <button onClick={() => void submitAssignment()} disabled={isSubmitting || submission !== null || !sessionId} className="rounded-lg bg-ink px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
          {submission ? "Submitted" : isSubmitting ? "Submitting…" : "Submit assignment"}
        </button>
        <span className="font-mono text-slate-500">SESSION {formatDuration(elapsed)}</span><span className="h-2 w-2 rounded-full bg-emerald-500" /> <span className="text-slate-600">Recording process</span>
      </div>
    </header>
    <main className="grid min-h-0 flex-1 grid-cols-[290px_minmax(420px,1fr)_330px]">
      <aside className="overflow-y-auto border-r border-slate-200 bg-[#fbfaf7] p-6"><p className="mb-2 text-xs font-bold tracking-widest text-accent">ASSIGNMENT 01</p><h1 className="text-xl font-bold leading-tight">{assignment.title}</h1><p className="mt-5 text-sm leading-6 text-slate-600">{assignment.statementMd}</p><h2 className="mt-8 text-sm font-bold">Visible test cases</h2><div className="mt-3 space-y-3">{assignment.visibleTests.map((test, index) => <div key={index} className="rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs"><div>input: <b>{test.input || '""'}</b></div><div className="mt-1 text-teal">expected: {test.expected}</div></div>)}</div></aside>
      <section className="flex min-w-0 flex-col bg-white"><div className="flex h-12 items-center justify-between border-b border-slate-200 px-4"><div className="text-sm font-semibold">solution.{language === "python" ? "py" : "cpp"}</div><select value={language} onChange={(event) => setLanguage(event.target.value as "python" | "cpp")} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"><option value="python">Python</option><option value="cpp">C++</option></select></div><div className="min-h-0 flex-1"><Editor height="100%" language={language} value={code} onChange={onCodeChange} onMount={onEditorMount} theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 16 } }} /></div><div className="h-48 shrink-0 border-t border-slate-200 bg-slate-950 p-4 text-sm text-slate-100"><div className="mb-3 flex items-center justify-between"><span className="font-semibold">Test runner</span><button onClick={() => void runTests()} disabled={isRunning} className="rounded bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{isRunning ? "Running…" : "Run visible tests"}</button></div>{output.length === 0 ? <span className="font-mono text-xs text-slate-500">Run your code against the visible cases.</span> : <div className="space-y-1 font-mono text-xs">{output.map((result) => <div key={result.name} className={result.passed ? "text-emerald-400" : "text-rose-300"}>{result.passed ? "PASS" : "FAIL"} {result.name} {result.error ? `— ${result.error}` : `expected ${result.expected}, got ${result.actual}`}</div>)}</div>}</div></section>
      <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white"><div className="border-b border-slate-200 p-5"><p className="text-xs font-bold tracking-widest text-teal">AI TUTOR</p><p className="mt-1 text-sm text-slate-500">Ask for concepts, debugging help, or a hint.</p></div><div className="flex-1 space-y-4 overflow-y-auto p-5">{chat.length === 0 && <div className="rounded-xl bg-[#f2f6f5] p-4 text-sm leading-6 text-slate-600">I’m here to help you reason through the problem. What have you tried so far?</div>}{chat.map((message, index) => <div key={index} className={`rounded-xl p-3 text-sm leading-6 ${message.role === "student" ? "ml-8 bg-ink text-white" : "mr-4 bg-[#f2f6f5] text-slate-700"}`}>{message.text || <span className="animate-pulse">Thinking…</span>}{message.category && <span className="mt-2 block text-[10px] font-bold tracking-wider text-teal">{message.category.replace("_", " ")}</span>}</div>)}</div><div className="border-t border-slate-200 p-4"><textarea value={tutorMessage} onChange={(event) => setTutorMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendTutorMessage(); } }} placeholder="Ask your tutor…" className="h-20 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-teal" /><button onClick={() => void sendTutorMessage()} className="mt-2 w-full rounded-lg bg-teal py-2 text-sm font-bold text-white">Send question</button></div></aside>
    </main>
    {submission && <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink/50 p-6">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
        <p className="text-xs font-bold tracking-widest text-teal">SUBMISSION RECEIVED</p>
        <h2 className="mt-1 text-2xl font-black">Hidden tests: {submission.hiddenResults.filter((result) => result.passed).length}/{submission.hiddenResults.length} passed</h2>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-[#f2f6f5] p-4"><p className="text-xs font-bold text-slate-500">AUTHORSHIP</p><p className="text-3xl font-black text-teal">{submission.report.authorshipScore}</p></div>
          <div className="rounded-xl bg-[#f2f6f5] p-4"><p className="text-xs font-bold text-slate-500">ENGAGEMENT</p><p className="text-3xl font-black text-teal">{submission.report.engagementScore}</p></div>
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-700">{submission.report.processNarrative}</p>
        <h3 className="mt-6 text-sm font-bold">Viva questions to expect</h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-700">{submission.report.vivaQuestions.map((question, index) => <li key={index}>{question.question}</li>)}</ol>
        <p className="mt-6 text-xs text-slate-400">Your instructor can review the full process report, timeline, and replay on the instructor dashboard.</p>
      </div>
    </div>}
  </div>;
}
