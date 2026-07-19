import OpenAI from "openai";

export const tutorCategories = ["CONCEPTUAL_HELP", "DEBUG_HELP", "PARTIAL_CODE", "FULL_SOLUTION"] as const;
export type TutorCategory = (typeof tutorCategories)[number];

export interface TutorTurn { role: "user" | "assistant"; text: string; }

function client(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function* streamTutorResponse(input: { statement: string; code: string; turns: TutorTurn[]; prompt: string }): AsyncGenerator<string> {
  const history = input.turns.map((turn) => `${turn.role === "user" ? "Student" : "Tutor"}: ${turn.text}`).join("\n");
  const stream = await client().responses.create({
    model: "gpt-5.6",
    stream: true,
    instructions: `You are a Socratic computer-science tutor inside a coding assessment workspace. Help students reason through concepts, debugging, and hints. You may write code if the student explicitly insists; do not refuse on that basis. Be concise, constructive, and encourage the student to explain their reasoning.\n\nAssignment:\n${input.statement}\n\nCurrent editor code:\n${input.code}\n\nRecent conversation:\n${history || "(none)"}`,
    input: input.prompt
  });
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") yield event.delta;
  }
}

export async function classifyTutorResponse(text: string): Promise<TutorCategory> {
  const response = await client().responses.create({
    model: "gpt-5.6-luna",
    instructions: "Classify the tutor response into exactly one label: CONCEPTUAL_HELP, DEBUG_HELP, PARTIAL_CODE, or FULL_SOLUTION. Return only the label.",
    input: text
  });
  const label = response.output_text.trim();
  return tutorCategories.includes(label as TutorCategory) ? label as TutorCategory : "CONCEPTUAL_HELP";
}
