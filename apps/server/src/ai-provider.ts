import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL_FOR: Record<string, string> = {
  "gpt-5.6": "gemini-flash-latest",
  "gpt-5.6-luna": "gemini-flash-latest"
};

function resolveKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  return key;
}

function isOpenAiKey(key: string): boolean {
  return key.startsWith("sk-");
}

function resolveGeminiModel(model: string): string {
  return GEMINI_MODEL_FOR[model] ?? "gemini-flash-latest";
}

export async function* streamText(input: { model: string; instructions: string; input: string }): AsyncGenerator<string> {
  const key = resolveKey();
  if (isOpenAiKey(key)) {
    const stream = await new OpenAI({ apiKey: key }).responses.create({ model: input.model, stream: true, instructions: input.instructions, input: input.input });
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") yield event.delta;
    }
    return;
  }
  const ai = new GoogleGenAI({ apiKey: key });
  const stream = await ai.models.generateContentStream({
    model: resolveGeminiModel(input.model),
    contents: input.input,
    config: { systemInstruction: input.instructions }
  });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}

export async function generateText(input: { model: string; instructions: string; input: string; jsonMode?: boolean }): Promise<string> {
  const key = resolveKey();
  if (isOpenAiKey(key)) {
    const response = await new OpenAI({ apiKey: key }).responses.create({ model: input.model, instructions: input.instructions, input: input.input });
    return response.output_text;
  }
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({
    model: resolveGeminiModel(input.model),
    contents: input.input,
    config: { systemInstruction: input.instructions, ...(input.jsonMode ? { responseMimeType: "application/json" } : {}) }
  });
  return response.text ?? "";
}
