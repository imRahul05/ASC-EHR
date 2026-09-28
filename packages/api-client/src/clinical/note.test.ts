import type { NoteStreamEvent } from "@asc/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamNoteGeneration } from "./note";

function sseResponse(chunks: readonly string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

const frame = (event: object) => `event: x\ndata: ${JSON.stringify(event)}\n\n`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamNoteGeneration", () => {
  it("parses events split across chunks, ignores unknown types and stops at the terminal event", async () => {
    const text =
      frame({ seq: 1, ts: "t", type: "started", noteId: "n1" }) +
      frame({ seq: 2, ts: "t", type: "mystery" }) +
      frame({ seq: 3, ts: "t", type: "section_delta", sectionId: "indication", title: "Indication", delta: "Screening" }) +
      frame({ seq: 4, ts: "t", type: "failed", code: "X", message: "boom" }) +
      frame({ seq: 5, ts: "t", type: "heartbeat" });
    const chunks = [text.slice(0, 17), text.slice(17, 90), text.slice(90)];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(sseResponse(chunks))));

    const events: NoteStreamEvent[] = [];
    await streamNoteGeneration("c1", (event) => events.push(event));
    expect(events.map((event) => event.type)).toEqual(["started", "section_delta", "failed"]);
  });

  it("rejects with ApiError on an error response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ message: "Signed", code: "NOTE_ALREADY_SIGNED" }, { status: 409 }))));
    await expect(streamNoteGeneration("c1", () => undefined)).rejects.toMatchObject({ status: 409, code: "NOTE_ALREADY_SIGNED" });
  });
});
