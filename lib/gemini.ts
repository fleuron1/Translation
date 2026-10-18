import { GoogleGenAI } from "@google/genai";

/** An alias, so the default tracks the current flash model instead of going stale. */
export const FALLBACK_MODEL = "gemini-flash-latest";

export class MissingKeyError extends Error {
  constructor() {
    super(
      "No Gemini API key. Put GEMINI_API_KEY=... in .env.local (get one at https://aistudio.google.com/apikey) and restart the dev server.",
    );
    this.name = "MissingKeyError";
  }
}

export function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new MissingKeyError();
  return new GoogleGenAI({ apiKey });
}

export function defaultModel(): string {
  return process.env.GEMINI_MODEL || FALLBACK_MODEL;
}

type JsonCallOptions = {
  model?: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
  /** Disable the model's thinking budget for cheap, shallow calls. */
  fast?: boolean;
};

/**
 * One structured-output call. Gemini is asked for JSON matching `schema`, so
 * the routes can hand typed objects straight to the UI.
 */
export async function askJson<T>(options: JsonCallOptions): Promise<T> {
  const ai = client();
  const model = options.model?.trim() || defaultModel();

  const config: Record<string, unknown> = {
    systemInstruction: options.system,
    responseMimeType: "application/json",
    responseSchema: options.schema,
    temperature: options.temperature ?? 0.2,
  };
  if (options.fast) config.thinkingConfig = { thinkingBudget: 0 };

  let response;
  try {
    response = await ai.models.generateContent({ model, contents: options.prompt, config });
  } catch (error) {
    // Not every model accepts a thinking budget; retry once without it.
    if (options.fast) {
      delete config.thinkingConfig;
      response = await ai.models.generateContent({ model, contents: options.prompt, config });
    } else {
      throw error;
    }
  }

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  try {
    return JSON.parse(text) as T;
  } catch {
    // Occasionally the JSON arrives wrapped in a code fence.
    const bare = text.replace(/^[\s\S]*?```(?:json)?/, "").replace(/```[\s\S]*$/, "");
    return JSON.parse(bare) as T;
  }
}

export function errorResponse(error: unknown): { status: number; body: { error: string } } {
  if (error instanceof MissingKeyError) return { status: 503, body: { error: error.message } };
  const message = error instanceof Error ? error.message : String(error);
  if (/API_KEY_INVALID|API key not valid/i.test(message)) {
    return { status: 401, body: { error: "Gemini rejected the API key in .env.local." } };
  }
  // A bare PERMISSION_DENIED also shows up as a transient blip under load.
  if (/PERMISSION_DENIED|caller does not have permission/i.test(message)) {
    return {
      status: 503,
      body: { error: "Gemini refused that call (permission denied). Usually transient — try again." },
    };
  }
  if (/RESOURCE_EXHAUSTED|quota|429/i.test(message)) {
    return {
      status: 429,
      body: { error: "Gemini quota or rate limit hit. Wait a moment, or switch model in Settings." },
    };
  }
  if (/not found|NOT_FOUND|is not supported/i.test(message)) {
    return { status: 400, body: { error: `${message} — pick another model in Settings.` } };
  }
  return { status: 500, body: { error: message } };
}
