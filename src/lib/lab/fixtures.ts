export type FixtureValue =
  | string
  | number
  | boolean
  | null
  | readonly FixtureValue[]
  | { readonly [key: string]: FixtureValue };

export interface AcceptanceAction {
  readonly id: string;
  readonly type: string;
  readonly input: Readonly<Record<string, FixtureValue>>;
}

export interface AcceptanceMessage {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly status: "queued" | "delivered";
  readonly payload: Readonly<Record<string, FixtureValue>>;
}

export interface AcceptanceCheckpoint {
  readonly afterAction: string;
  readonly visibleState: Readonly<Record<string, FixtureValue>>;
  readonly causalMetadata: Readonly<Record<string, FixtureValue>>;
}

export interface AcceptanceFixture {
  readonly id: string;
  readonly topic: string;
  readonly actions: readonly AcceptanceAction[];
  readonly expected: {
    readonly checkpoints?: readonly AcceptanceCheckpoint[];
    readonly visibleState: Readonly<Record<string, FixtureValue>>;
    readonly causalMetadata: Readonly<Record<string, FixtureValue>>;
    readonly messages: readonly AcceptanceMessage[];
    readonly invariants: Readonly<Record<string, boolean>>;
  };
}

export const acceptanceFixtures = [
  {
    id: "local-history-message-observation",
    topic: "local history and message observation",
    actions: [
      { id: "a1", type: "local-event", input: { replica: "A", value: "draft" } },
      { id: "send-m1", type: "send", input: { message: "m1", from: "A", to: "B", observes: ["a1"] } },
      { id: "a2", type: "local-event", input: { replica: "A", value: "publish" } },
      { id: "b1", type: "deliver", input: { message: "m1", replica: "B" } },
    ],
    expected: {
      visibleState: {
        A: { history: ["a1", "a2"], observed: ["a1", "a2"] },
        B: { history: ["b1"], observed: ["a1", "b1"] },
      },
      causalMetadata: {
        predecessors: { a1: [], a2: ["a1"], b1: ["a1"] },
        relations: { "a1:a2": "before", "a1:b1": "before", "a2:b1": "concurrent" },
      },
      messages: [
        { id: "m1", from: "A", to: "B", status: "delivered", payload: { observes: ["a1"] } },
      ],
      invariants: {
        localHistoryIsOrdered: true,
        deliveryAddsOnlyObservedHistory: true,
        noReplicaHasGlobalKnowledge: true,
      },
    },
  },
  {
    id: "partial-order-comparison",
    topic: "partial-order comparison",
    actions: [
      { id: "a1", type: "local-event", input: { replica: "A" } },
      { id: "send-m1", type: "send", input: { message: "m1", from: "A", to: "B", observes: ["a1"] } },
      { id: "c1", type: "local-event", input: { replica: "C" } },
      { id: "b1", type: "deliver", input: { message: "m1", replica: "B" } },
      { id: "compare", type: "compare-events", input: { pairs: [["a1", "b1"], ["b1", "c1"], ["c1", "c1"]] } },
    ],
    expected: {
      visibleState: {
        A: { history: ["a1"] },
        B: { history: ["b1"] },
        C: { history: ["c1"] },
        comparisons: { "a1:b1": "before", "b1:c1": "concurrent", "c1:c1": "equal" },
      },
      causalMetadata: {
        edges: [["a1", "b1"]],
        concurrent: [["a1", "c1"], ["b1", "c1"]],
      },
      messages: [
        { id: "m1", from: "A", to: "B", status: "delivered", payload: { observes: ["a1"] } },
      ],
      invariants: {
        happensBeforeIsTransitive: true,
        concurrentEventsHaveNoPath: true,
        buttonOrderDoesNotCreateCausality: true,
      },
    },
  },
  {
    id: "lamport-ordering-concurrency-limit",
    topic: "Lamport-clock ordering and its concurrency limitation",
    actions: [
      { id: "a1", type: "local-event", input: { replica: "A" } },
      { id: "b1", type: "local-event", input: { replica: "B" } },
      { id: "a2", type: "send", input: { message: "m1", from: "A", to: "B" } },
      { id: "b2", type: "deliver", input: { message: "m1", replica: "B" } },
    ],
    expected: {
      visibleState: {
        A: { clock: 2, history: ["a1@1", "a2@2"] },
        B: { clock: 3, history: ["b1@1", "b2@3"] },
        totalOrder: ["a1@1/A", "b1@1/B", "a2@2/A", "b2@3/B"],
      },
      causalMetadata: {
        timestamps: { a1: 1, b1: 1, a2: 2, b2: 3 },
        happensBefore: [["a1", "a2"], ["a2", "b2"], ["a1", "b2"], ["b1", "b2"]],
        concurrent: [["a1", "b1"], ["a2", "b1"]],
      },
      messages: [
        { id: "m1", from: "A", to: "B", status: "delivered", payload: { lamport: 2 } },
      ],
      invariants: {
        localClockIncreases: true,
        receiveClockExceedsMessageClock: true,
        happensBeforeImpliesLowerTimestamp: true,
        lowerTimestampDoesNotProveHappensBefore: true,
        totalOrderTieBreakIsNotCausality: true,
      },
    },
  },
  {
    id: "vector-clock-comparisons",
    topic: "vector-clock before/after/equal/concurrent comparisons",
    actions: [
      { id: "before", type: "compare-vectors", input: { left: { A: 1, B: 0 }, right: { A: 1, B: 1 } } },
      { id: "after", type: "compare-vectors", input: { left: { A: 1, B: 1 }, right: { A: 1, B: 0 } } },
      { id: "equal", type: "compare-vectors", input: { left: { A: 1, B: 1 }, right: { A: 1, B: 1 } } },
      { id: "concurrent", type: "compare-vectors", input: { left: { A: 2, B: 0 }, right: { A: 1, B: 1 } } },
    ],
    expected: {
      visibleState: {
        before: "before",
        after: "after",
        equal: "equal",
        concurrent: "concurrent",
      },
      causalMetadata: {
        before: { left: { A: 1, B: 0 }, right: { A: 1, B: 1 } },
        after: { left: { A: 1, B: 1 }, right: { A: 1, B: 0 } },
        equal: { left: { A: 1, B: 1 }, right: { A: 1, B: 1 } },
        concurrent: { left: { A: 2, B: 0 }, right: { A: 1, B: 1 } },
      },
      messages: [],
      invariants: {
        comparisonUsesEveryComponent: true,
        missingComponentsAreZero: true,
        allFourRelationsAreRepresented: true,
      },
    },
  },
  {
    id: "dots-concurrent-add-remove",
    topic: "Dots concurrent add/remove",
    actions: [
      { id: "add-a", type: "add", input: { replica: "A", value: "beacon" } },
      { id: "deliver-m1", type: "deliver", input: { message: "m1:A:B" } },
      { id: "partition", type: "partition", input: { left: "A", right: "B" } },
      { id: "remove-a", type: "remove", input: { replica: "A", value: "beacon" } },
      { id: "add-b", type: "add", input: { replica: "B", value: "beacon" } },
      { id: "heal", type: "heal", input: { left: "A", right: "B" } },
      { id: "deliver-m2", type: "deliver", input: { message: "m2:A:B" } },
      { id: "deliver-m3", type: "deliver", input: { message: "m3:B:A" } },
    ],
    expected: {
      visibleState: {
        A: { values: ["beacon"], liveDots: ["B:1"] },
        B: { values: ["beacon"], liveDots: ["B:1"] },
      },
      causalMetadata: {
        A: { context: { A: 1, B: 1 }, removedDots: ["A:1"] },
        B: { context: { A: 1, B: 1 }, removedDots: ["A:1"] },
      },
      messages: [],
      invariants: {
        uniqueDots: true,
        removedDotsStayRemoved: true,
        concurrentAddSurvivesObservedRemove: true,
        converged: true,
      },
    },
  },
  {
    id: "mv-register-concurrent-writes-observed-resolution",
    topic: "multi-value register concurrent writes and observed resolution",
    actions: [
      { id: "write-a-red", type: "write", input: { replica: "A", value: "red", version: "A:1" } },
      { id: "write-b-blue", type: "write", input: { replica: "B", value: "blue", version: "B:1" } },
      { id: "deliver-red", type: "deliver", input: { message: "m1:A:B" } },
      { id: "deliver-blue", type: "deliver", input: { message: "m2:B:A" } },
      { id: "write-a-green", type: "write", input: { replica: "A", value: "green", version: "A:2" } },
      { id: "deliver-green", type: "deliver", input: { message: "m3:A:B" } },
    ],
    expected: {
      checkpoints: [
        {
          afterAction: "deliver-blue",
          visibleState: {
            A: { values: ["red", "blue"] },
            B: { values: ["red", "blue"] },
          },
          causalMetadata: {
            A: {
              context: { A: 1, B: 1 },
              versions: { red: { A: 1, B: 0 }, blue: { A: 0, B: 1 } },
            },
            B: {
              context: { A: 1, B: 1 },
              versions: { red: { A: 1, B: 0 }, blue: { A: 0, B: 1 } },
            },
          },
        },
      ],
      visibleState: {
        A: { values: ["green"] },
        B: { values: ["green"] },
      },
      causalMetadata: {
        A: { context: { A: 2, B: 1 }, versions: { green: { A: 2, B: 1 } } },
        B: { context: { A: 2, B: 1 }, versions: { green: { A: 2, B: 1 } } },
        superseded: ["red@A:1", "blue@B:1"],
      },
      messages: [],
      invariants: {
        concurrentWritesRemainVisible: true,
        observedResolutionSupersedesObservedVersions: true,
        unobservedConcurrentVersionsWouldSurvive: true,
        converged: true,
      },
    },
  },
  {
    id: "or-set-concurrent-add-remove-stale-replay",
    topic: "observed-remove set concurrent add/remove and stale replay",
    actions: [
      { id: "add-a", type: "add", input: { replica: "A", value: "beacon", dot: "A:1" } },
      { id: "copy-m1", type: "duplicate", input: { message: "m1:A:B", copy: "m1:A:B:copy1" } },
      { id: "deliver-m1", type: "deliver", input: { message: "m1:A:B" } },
      { id: "partition", type: "partition", input: { left: "A", right: "B" } },
      { id: "remove-a", type: "remove", input: { replica: "A", value: "beacon", observed: ["A:1"] } },
      { id: "add-b", type: "add", input: { replica: "B", value: "beacon", dot: "B:1" } },
      { id: "heal", type: "heal", input: { left: "A", right: "B" } },
      { id: "deliver-remove", type: "deliver", input: { message: "m2:A:B" } },
      { id: "deliver-add", type: "deliver", input: { message: "m3:B:A" } },
      { id: "replay-stale-add", type: "deliver", input: { message: "m1:A:B:copy1" } },
    ],
    expected: {
      visibleState: {
        A: { values: ["beacon"], liveDots: ["B:1"] },
        B: { values: ["beacon"], liveDots: ["B:1"] },
      },
      causalMetadata: {
        A: { context: { A: 1, B: 1 }, additions: ["A:1", "B:1"], removedDots: ["A:1"] },
        B: { context: { A: 1, B: 1 }, additions: ["A:1", "B:1"], removedDots: ["A:1"] },
      },
      messages: [],
      invariants: {
        removeTargetsOnlyObservedDots: true,
        concurrentAddSurvives: true,
        staleReplayDoesNotResurrectRemovedDot: true,
        duplicateDeliveryIsIdempotent: true,
        converged: true,
      },
    },
  },
] as const satisfies readonly AcceptanceFixture[];
