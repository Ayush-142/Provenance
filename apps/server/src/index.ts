import "dotenv/config";
import express from "express";
import { eventTypes, type EventType, type TestCase } from "@provenance/shared";
import { prisma } from "./db.js";
import { runCode } from "./runner.js";
import { summarizeSession } from "./session-summary.js";
import { classifyTutorResponse, streamTutorResponse, type TutorTurn } from "./tutor.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.get("/health", (_request, response) => response.json({ status: "ok" }));

app.get("/api/assignments/:id", async (request, response, next) => {
  try {
    const assignment = await prisma.assignment.findUnique({ where: { id: request.params.id } });
    if (!assignment) return response.status(404).json({ error: "Assignment not found." });
    return response.json({ ...assignment, visibleTests: JSON.parse(assignment.visibleTestsJson), hiddenTests: undefined });
  } catch (error) { return next(error); }
});

app.post("/api/sessions", async (request, response, next) => {
  try {
    const { studentName, assignmentId } = request.body as { studentName?: unknown; assignmentId?: unknown };
    if (typeof studentName !== "string" || !studentName.trim() || typeof assignmentId !== "string") return response.status(400).json({ error: "studentName and assignmentId are required." });
    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return response.status(404).json({ error: "Assignment not found." });
    const session = await prisma.session.create({ data: { studentName: studentName.trim(), assignmentId, startedAt: new Date(), events: { create: { type: "SESSION_START", timestamp: new Date(), payloadJson: "{}" } } } });
    return response.status(201).json(session);
  } catch (error) { return next(error); }
});

app.post("/api/sessions/:id/events", async (request, response, next) => {
  try {
    const rawEvents = request.body.events;
    if (!Array.isArray(rawEvents) || rawEvents.length === 0 || rawEvents.length > 100) return response.status(400).json({ error: "events must contain 1-100 events." });
    const session = await prisma.session.findUnique({ where: { id: request.params.id } });
    if (!session) return response.status(404).json({ error: "Session not found." });
    const events = rawEvents.map((item: unknown) => {
      const event = item as { type?: unknown; timestamp?: unknown; payload?: unknown };
      if (typeof event.type !== "string" || !eventTypes.includes(event.type as EventType) || Number.isNaN(Date.parse(String(event.timestamp)))) throw new Error("Invalid event.");
      return { sessionId: session.id, type: event.type as EventType, timestamp: new Date(String(event.timestamp)), payloadJson: JSON.stringify(event.payload ?? {}) };
    });
    await prisma.event.createMany({ data: events });
    return response.status(202).json({ accepted: events.length });
  } catch (error) { return next(error); }
});

app.post("/api/sessions/:id/run", async (request, response, next) => {
  try {
    const { code, language } = request.body as { code?: unknown; language?: unknown };
    const session = await prisma.session.findUnique({ where: { id: request.params.id }, include: { assignment: true } });
    if (!session) return response.status(404).json({ error: "Session not found." });
    if (typeof code !== "string" || (language !== "python" && language !== "cpp")) return response.status(400).json({ error: "code and a supported language are required." });
    const tests = JSON.parse(session.assignment.visibleTestsJson) as TestCase[];
    const results = await runCode(language, code, tests);
    await prisma.event.create({ data: { sessionId: session.id, type: "TEST_RUN", timestamp: new Date(), payloadJson: JSON.stringify({ allPassed: results.every((result) => result.passed), failedTest: results.find((result) => !result.passed)?.name, results }) } });
    return response.json({ results });
  } catch (error) { return next(error); }
});

app.post("/api/sessions/:id/chat", async (request, response, next) => {
  try {
    const { prompt, code } = request.body as { prompt?: unknown; code?: unknown };
    if (typeof prompt !== "string" || !prompt.trim() || typeof code !== "string") return response.status(400).json({ error: "prompt and code are required." });
    const session = await prisma.session.findUnique({ where: { id: request.params.id }, include: { assignment: true, events: { orderBy: { timestamp: "asc" } } } });
    if (!session) return response.status(404).json({ error: "Session not found." });

    const transcript: TutorTurn[] = session.events.filter((event) => event.type === "PROMPT_SENT" || event.type === "AI_RESPONSE").flatMap((event) => {
      try {
        const payload = JSON.parse(event.payloadJson) as { text?: unknown };
        if (typeof payload.text !== "string") return [];
        return [{ role: event.type === "PROMPT_SENT" ? "user" as const : "assistant" as const, text: payload.text }];
      } catch { return []; }
    }).slice(-10);
    await prisma.event.create({ data: { sessionId: session.id, type: "PROMPT_SENT", timestamp: new Date(), payloadJson: JSON.stringify({ text: prompt.trim() }) } });

    response.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    response.flushHeaders();
    let answer = "";
    try {
      for await (const delta of streamTutorResponse({ statement: session.assignment.statementMd, code, turns: transcript, prompt: prompt.trim() })) {
        answer += delta;
        response.write(`data: ${JSON.stringify({ type: "delta", text: delta })}\n\n`);
      }
      const category = await classifyTutorResponse(answer);
      await prisma.event.create({ data: { sessionId: session.id, type: "AI_RESPONSE", timestamp: new Date(), payloadJson: JSON.stringify({ text: answer, category }) } });
      response.write(`data: ${JSON.stringify({ type: "done", category })}\n\n`);
    } catch (error) {
      response.write(`data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Tutor request failed." })}\n\n`);
    }
    return response.end();
  } catch (error) { return next(error); }
});

app.get("/api/sessions/:id/summary", async (request, response, next) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: request.params.id }, include: { events: { orderBy: { timestamp: "asc" } } } });
    if (!session) return response.status(404).json({ error: "Session not found." });
    return response.json(summarizeSession(session.startedAt, session.events, session.finalCode));
  } catch (error) { return next(error); }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(400).json({ error: error instanceof Error ? error.message : "Unexpected server error." });
});

app.listen(3001, () => console.log("Provenance server listening on http://localhost:3001"));
