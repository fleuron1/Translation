import { NextResponse } from "next/server";
import { client, defaultModel, errorResponse } from "@/lib/gemini";

export const runtime = "nodejs";

/**
 * Lists the caller's available Gemini models so Settings can offer real
 * choices instead of hardcoded names that go stale.
 */
export async function GET() {
  try {
    const ai = client();
    const models: { name: string; label: string }[] = [];

    const page = await ai.models.list({ config: { pageSize: 100 } });
    for await (const model of page) {
      const name = (model.name ?? "").replace(/^models\//, "");
      if (!name || !name.startsWith("gemini")) continue;
      const actions = model.supportedActions ?? [];
      if (actions.length && !actions.includes("generateContent")) continue;
      if (/embedding|aqa|image|tts|native-audio|live/i.test(name)) continue;
      models.push({ name, label: model.displayName ?? name });
    }

    models.sort((a, b) => b.name.localeCompare(a.name));
    return NextResponse.json({ models, current: defaultModel() });
  } catch (error) {
    const { status, body } = errorResponse(error);
    return NextResponse.json({ ...body, models: [], current: "" }, { status });
  }
}
