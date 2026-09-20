import { describe, expect, test } from "vitest";
import { compareVectors, type DotsObservation, type TraceFrame } from "./contract";

function assertReadonly(frame: TraceFrame<DotsObservation>): void {
  // @ts-expect-error TraceFrame fields are immutable.
  frame.index = 1;
  // @ts-expect-error ReplicaView fields are immutable.
  frame.replicas[0].id = "B";
  // @ts-expect-error MessageView fields are immutable.
  frame.messages[0].id = "message-2";
  // @ts-expect-error Dot fields are immutable.
  frame.replicas[0].dots[0].counter = 2;
  if (frame.action?.type === "add") {
    // @ts-expect-error Recorded action fields are immutable.
    frame.action.value = "changed";
  }
}

void assertReadonly;

describe("compareVectors", () => {
  test("detects before, after, equal, and concurrent vectors", () => {
    expect(compareVectors({ A: 1 }, { A: 2 })).toBe("before");
    expect(compareVectors({ A: 2 }, { A: 1 })).toBe("after");
    expect(compareVectors({ A: 2, B: 1 }, { A: 2, B: 1 })).toBe("equal");
    expect(compareVectors({ A: 2 }, { A: 1, B: 1 })).toBe("concurrent");
  });

  test("treats absent components as zero even when replica names match prototype properties", () => {
    expect(compareVectors({ constructor: 1 }, {})).toBe("after");
    expect(compareVectors({}, { toString: 1 })).toBe("before");
    expect(compareVectors(JSON.parse('{"__proto__":1}'), {})).toBe("after");
  });
});
