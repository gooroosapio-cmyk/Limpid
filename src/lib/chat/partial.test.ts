import { describe, expect, it } from "vitest";
import { partialString } from "./partial";
import { readStream } from "@/lib/engine/openrouter";

describe("réponse progressive", () => {
  it("lit la réponse en cours d'écriture, échappements compris", () => {
    expect(partialString('{"answer": "Chaque op', "answer")).toBe("Chaque op");
    expect(partialString('{"answer":"Un \\"compte\\" et\\nun autre', "answer")).toBe('Un "compte" et\nun autre');
    expect(partialString('{"answer":"Débit\\', "answer")).toBe("Débit");
    expect(partialString('{"answer":"caf\\u00e9", "in_document": true', "answer")).toBe("café");
    expect(partialString('{"in_document": tr', "answer")).toBeNull();
  });

  it("reconstitue une complétion à partir du flux SSE", async () => {
    const sse = [
      ": OPENROUTER PROCESSING\n\n",
      'data: {"id":"g1","model":"m","choices":[{"delta":{"content":"{\\"answer\\":\\"Bon"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"jour\\"}"},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4,"cost":0.001}}\n\n',
      "data: [DONE]\n\n",
    ];
    const body = new ReadableStream({ start(c) { for (const x of sse) c.enqueue(new TextEncoder().encode(x)); c.close(); } });
    const seen: string[] = [];
    const out = await readStream(new Response(body), (t) => seen.push(t));
    expect(seen.at(-1)).toBe('{"answer":"Bonjour"}');
    expect(out.choices?.[0]?.message?.content).toBe('{"answer":"Bonjour"}');
    expect(out.choices?.[0]?.finish_reason).toBe("stop");
    expect(out.usage?.completion_tokens).toBe(4);
    expect(out.id).toBe("g1");
  });
});
