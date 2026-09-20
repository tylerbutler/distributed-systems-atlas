import { describe, expect, test } from "vitest";
import { compareVectors, type TraceFrame } from "./contract";

function assertReadonly(frame: TraceFrame): void {
  // @ts-expect-error TraceFrame fields are immutable.
  frame.index = 1;
  // @ts-expect-error ReplicaView fields are immutable.
  frame.replicas[0].id = "B";
  // @ts-expect-error MessageView fields are immutable.
  frame.messages[0].id = "message-2";
  // @ts-expect-error Dot fields are immutable.
  frame.replicas[0].dots[0].counter = 2;
}

void assertReadonly;

describe("compareVectors", () => {
  test("detects before, after, equal, and concurrent vectors", () => {
    expect(compareVectors({ A: 1 }, { A: 2 })).toBe("before");
    expect(compareVectors({ A: 2 }, { A: 1 })).toBe("after");
    expect(compareVectors({ A: 2, B: 1 }, { A: 2, B: 1 })).toBe("equal");
    expect(compareVectors({ A: 2 }, { A: 1, B: 1 })).toBe("concurrent");
  });
});
