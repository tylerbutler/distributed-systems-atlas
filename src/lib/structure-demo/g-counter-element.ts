import {
  createGCounterDemo,
  deliverNextOperation,
  deliverRace,
  gCounterUserName,
  incrementReplica,
  mergeReplicaCounts,
  presentGCounterDemo,
  resendUserCount,
  stageRace,
  type GCounterDemoResult,
  type GCounterDemoState,
  type ReplicaId,
  type Counts,
} from "./g-counter";
import { annotate } from "rough-notation";
import {
  autoDeliveryChangeEvent,
  DemoTransportControlsElement,
} from "./demo-transport-controls";
import { animateDemoOperation } from "./demo-operation-flight";
import { isDemoReplicaId } from "./replicas";
import {
  GCounterRoomClient,
  normalizeRoomCode,
  type RoomState,
} from "./g-counter-room-client";
import { REPLICA_IDS } from "./replicas";
import { MAX_COMPONENT } from "../../../worker/protocol";

type Action = "race" | "resend" | "reset";
type RoomAction = "create" | "join" | "copy" | "leave";
const HOP_LATENCY_MS = 1000;
const FIFO_GAP_MS = 25;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

class GCounterDemoElement extends HTMLElement {
  private state: GCounterDemoState = createGCounterDemo();
  private delivering = false;
  private guided = false;
  private guidedTimer: number | undefined;
  private guidedAnnotations: Array<ReturnType<typeof annotate>> = [];
  private generation = 0;
  private lastOutboundArrival = 0;
  private outboundArrivals: Promise<void>[] = [];
  private activeBroadcasts = new Set<Promise<void>>();
  private activeAnimations = new Set<Animation>();
  private deliveryFocus: HTMLElement | null = null;
  private roomClient?: GCounterRoomClient;
  private roomCode = "";
  private roomReplica: ReplicaId | null = null;
  private roomConnected = false;
  private roomPresence = 0;
  private roomEpoch = "";
  private roomConfirmedCounts: Counts = { A: 0, B: 0, C: 0 };

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-increment]")) {
      button.addEventListener("click", async () => {
        const replica = button.dataset.replica as ReplicaId;
        const amount = Number(button.dataset.increment);
        if (this.roomClient && (!this.roomConnected || replica !== this.roomReplica)) return;
        if (this.roomClient && this.state.authoredCounts[replica] > MAX_COMPONENT - amount) {
          this.roomStatus("This hiker's count reached the numeric limit. Reset the room before adding more.");
          return;
        }
        const result = incrementReplica(this.state, replica, amount);
        this.apply(result, button);
        if (result.ok) {
          if (this.roomClient) {
            try {
              this.roomClient.publish(result.state.authoredCounts[replica], this.roomEpoch);
            } catch (error) {
              this.restoreRoomState({ epoch: this.roomEpoch, counts: this.roomConfirmedCounts });
              this.roomError(error);
              return;
            }
          }
          this.queueOutbound(replica, `+${amount}`);
          this.showGuidedObservation(
            `${gCounterUserName(replica)} records ${amount} more ${amount === 1 ? "bird" : "birds"} and leaves a checkpoint note.`,
            [this.querySelector<HTMLElement>(`[data-total="${replica}"]`)!],
            "circle",
          );
          if (this.transport.autoDeliver) await this.deliverQueued(button);
        }
      });
    }
    this.button("race").addEventListener("click", async () => {
      await this.runRace();
    });
    this.button("resend").addEventListener("click", async () => {
      await this.applyAnimated(resendUserCount(this.state), this.button("resend"));
    });
    this.button("reset").addEventListener("click", () => {
      if (this.roomClient) {
        try {
          this.roomClient.reset(this.roomEpoch);
        } catch (error) {
          this.roomError(error);
        }
        return;
      }
      this.resetFlow();
      this.state = createGCounterDemo();
      this.render();
      this.showGuidedObservation(
        "Turn off Broadcast to hold several checkpoint notes.",
        [],
      );
      this.querySelector<HTMLButtonElement>("[data-increment]")!.focus();
    });
    this.transport.addEventListener(autoDeliveryChangeEvent, async () => {
      this.render();
      if (this.transport.autoDeliver && presentGCounterDemo(this.state).canDeliver) {
        await this.deliverQueued(this.transport);
      }
    });
    const guided = this.querySelector<HTMLInputElement>("[data-guided-observations]")!;
    guided.addEventListener("change", () => {
      this.guided = guided.checked;
      this.querySelector<HTMLElement>("[data-guided-panel]")!.hidden = !this.guided;
      if (this.guided) {
        this.showGuidedObservation(
          "Turn off Broadcast to hold several checkpoint notes.",
          [],
        );
      } else {
        this.clearGuidedMarks();
      }
    });
    this.setupRoom();
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  disconnectedCallback(): void {
    this.roomClient?.close();
    this.resetFlow();
    this.clearGuidedMarks();
  }

  private button(action: Action): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing G-counter ${action} control`);
    return button;
  }

  private get transport(): DemoTransportControlsElement {
    const controls = this.querySelector<DemoTransportControlsElement>(
      "demo-transport-controls",
    );
    if (!controls) throw new Error("Missing G-counter transport controls");
    return controls;
  }

  private roomButton(action: RoomAction): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-room-action="${action}"]`);
    if (!button) throw new Error(`Missing G-counter room ${action} control`);
    return button;
  }

  private setupRoom(): void {
    const input = this.querySelector<HTMLInputElement>("[data-room-code]")!;
    input.addEventListener("input", () => {
      const normalized = normalizeRoomCode(input.value);
      if (input.value !== normalized) input.value = normalized;
      this.renderRoom();
    });
    this.roomButton("create").addEventListener("click", () => {
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      input.value = [...bytes]
        .map((value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length])
        .join("");
      this.connectRoom(input.value);
    });
    this.roomButton("join").addEventListener("click", () => this.connectRoom(input.value));
    this.roomButton("leave").addEventListener("click", () => this.leaveRoom());
    this.roomButton("copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(this.roomLink());
        this.roomStatus(`Copied the link for room ${this.roomCode}.`);
      } catch (error) {
        this.roomError(error);
      }
    });
    input.disabled = false;
    this.roomButton("create").disabled = false;
    this.roomStatus("Create a room, or enter a room code from another hiker.");
    const requested = normalizeRoomCode(new URL(location.href).searchParams.get("room") ?? "");
    if (requested.length >= 4) {
      input.value = requested;
      this.connectRoom(requested);
    } else {
      this.renderRoom();
    }
  }

  private connectRoom(value: string): void {
    const room = normalizeRoomCode(value);
    if (room.length < 4) {
      this.roomStatus("Enter a room code with at least four letters or numbers.");
      return;
    }
    this.roomClient?.close();
    this.roomCode = room;
    this.roomReplica = null;
    this.roomConnected = false;
    this.roomStatus(`Connecting to room ${room}...`);
    this.roomClient = new GCounterRoomClient(location.origin, {
      hello: (message) => {
        this.roomCode = message.room;
        this.roomReplica = message.replica;
        this.roomPresence = message.connected;
        this.roomConnected = true;
        this.restoreRoomState(message.state);
        const url = new URL(location.href);
        url.searchParams.set("room", this.roomCode);
        history.replaceState(null, "", url);
        this.renderRoom();
      },
      state: (state) => this.receiveRoomState(state),
      reset: (state) => {
        if (state.epoch === this.roomEpoch) {
          this.receiveRoomState(state);
        } else {
          this.restoreRoomState(state);
          this.roomStatus(`Room ${this.roomCode} was reset. Earlier changes were discarded.`);
        }
      },
      rejected: (message, state) => {
        this.restoreRoomState(state);
        this.roomStatus(message);
      },
      presence: (connected) => {
        this.roomPresence = connected;
        this.renderRoom();
      },
      status: (message) => this.roomStatus(message),
      closed: () => {
        if (!this.roomConnected && this.roomReplica === null) return;
        this.roomConnected = false;
        this.roomReplica = null;
        this.render();
        this.roomStatus(
          `Disconnected from room ${this.roomCode}. Counts may include unconfirmed changes. Rejoin to load stored state.`,
        );
      },
    });
    this.render();
    this.roomClient.connect(room);
  }

  private leaveRoom(): void {
    this.roomClient?.close();
    this.roomClient = undefined;
    this.roomConnected = false;
    this.roomReplica = null;
    this.roomPresence = 0;
    const url = new URL(location.href);
    url.searchParams.delete("room");
    history.replaceState(null, "", url);
    this.roomStatus("Left the live room. This browser now controls all three hikers.");
    this.render();
  }

  private restoreRoomState(snapshot: RoomState): void {
    this.resetFlow();
    const merged = mergeReplicaCounts(createGCounterDemo(), snapshot.counts);
    if (!merged.ok) {
      this.roomStatus(merged.error);
      return;
    }
    const settled = merged.state.view.pending ? deliverRace(merged.state) : merged;
    if (!settled.ok) {
      this.roomStatus(settled.error);
      return;
    }
    this.roomEpoch = snapshot.epoch;
    this.roomConfirmedCounts = { ...snapshot.counts };
    this.state = {
      ...settled.state,
      baselineSequence: settled.state.view.sequenceNumber,
      deliveries: [],
      latestDeliveries: [],
      result: `Loaded stored room state. All three hikers read ${settled.state.view.replicas[0]?.value ?? 0} birds.`,
    };
    this.render();
  }

  private receiveRoomState(snapshot: RoomState): void {
    if (snapshot.epoch !== this.roomEpoch) return;
    const before = this.state.authoredCounts;
    const result = mergeReplicaCounts(this.state, snapshot.counts);
    if (!result.ok) {
      this.roomStatus(result.error);
      return;
    }
    for (const replica of REPLICA_IDS) {
      this.roomConfirmedCounts[replica] = Math.max(
        this.roomConfirmedCounts[replica], snapshot.counts[replica],
      );
    }
    this.state = result.state;
    this.render();
    for (const replica of REPLICA_IDS) {
      if (this.state.authoredCounts[replica] > before[replica]) {
        this.queueOutbound(replica, `count ${this.state.authoredCounts[replica]}`);
      }
    }
    if (this.transport.autoDeliver) {
      void this.deliverQueued(this.transport);
    }
  }

  private roomLink(): string {
    const url = new URL(location.href);
    url.searchParams.set("room", this.roomCode);
    return url.toString();
  }

  private roomError(error: unknown): void {
    this.roomStatus(error instanceof Error ? error.message : String(error));
  }

  private roomStatus(message: string): void {
    this.querySelector<HTMLElement>("[data-room-status]")!.textContent = message;
  }

  private renderRoom(): void {
    const input = this.querySelector<HTMLInputElement>("[data-room-code]")!;
    const validCode = normalizeRoomCode(input.value).length >= 4;
    input.disabled = this.roomConnected;
    this.roomButton("create").disabled = this.roomConnected;
    this.roomButton("join").disabled = this.roomConnected || !validCode;
    this.roomButton("copy").disabled = !this.roomConnected;
    this.roomButton("leave").disabled = !this.roomClient;
    if (!this.roomConnected) return;
    const role = this.roomReplica
      ? `This device controls ${gCounterUserName(this.roomReplica)}.`
      : "This device is observing because Alice, Bob, and Carol are connected.";
    this.roomStatus(
      `Room ${this.roomCode}: ${role} ${this.roomPresence} ${
        this.roomPresence === 1 ? "device is" : "devices are"
      } connected.${
        this.roomReplica && this.state.authoredCounts[this.roomReplica] > this.roomConfirmedCounts[this.roomReplica]
          ? " Local changes are waiting for storage confirmation."
          : ""
      }`,
    );
  }

  private async runRace(): Promise<void> {
    this.resetFlow();
    this.state = createGCounterDemo();
    const staged = stageRace(this.state);
    if (!staged.ok) {
      this.apply(staged, this.button("race"));
      return;
    }
    this.state = staged.state;
    this.render();
    const changed = presentGCounterDemo(this.state).replicas
      .filter((replica) => replica.value > 0);
    this.showGuidedObservation(
      `${changed.map((replica) => gCounterUserName(replica.id)).join(" and ")} count birds before the others receive their checkpoint notes.`,
      changed.map((replica) =>
        this.querySelector<HTMLElement>(`[data-total="${replica.id}"]`)!),
      "circle",
    );
    this.queueOutbound("A", "+7");
    this.queueOutbound("B", "+3");
    if (this.transport.autoDeliver) {
      await this.deliverQueued(this.button("resend"));
    } else {
      this.button("race").focus();
    }
  }

  private async deliverQueued(focus: HTMLElement): Promise<void> {
    this.deliveryFocus = focus;
    if (this.delivering) return;
    this.delivering = true;
    const generation = this.generation;
    try {
      while (
        this.transport.autoDeliver &&
        presentGCounterDemo(this.state).canDeliver
      ) {
        await (this.outboundArrivals.shift() ?? Promise.resolve());
        if (generation !== this.generation) return;
        const queuedOperations = presentGCounterDemo(this.state).queuedOperations;
        this.showGuidedObservation(
          `${queuedOperations} checkpoint ${queuedOperations === 1 ? "note is" : "notes are"} ready to be shared.`,
          [this.querySelector<HTMLElement>("[data-sequencer-node]")!],
          "box",
        );
        const delivered = deliverNextOperation(this.state);
        if (!delivered.ok) {
          this.apply(delivered, focus);
          return;
        }
        this.state = delivered.state;
        const view = presentGCounterDemo(this.state);
        this.render(false);
        this.launchBroadcast(view.latestDeliveries, view, generation);
      }
    } finally {
      if (generation !== this.generation) return;
      this.delivering = false;
      if (this.activeBroadcasts.size === 0) {
        this.render();
        this.deliveryFocus?.focus();
      }
      if (
        this.transport.autoDeliver &&
        presentGCounterDemo(this.state).canDeliver
      ) {
        void this.deliverQueued(focus);
      }
    }
  }

  private apply(result: GCounterDemoResult, focus: HTMLElement): void {
    const alert = this.querySelector<HTMLElement>('[role="alert"]')!;
    if (result.ok) {
      this.state = result.state;
      alert.hidden = true;
      alert.textContent = "";
    } else {
      alert.textContent = result.error;
      alert.hidden = false;
    }
    this.render();
    (result.ok ? focus : this.button("reset")).focus();
  }

  private async applyAnimated(result: GCounterDemoResult, focus: HTMLElement): Promise<void> {
    if (!result.ok) {
      this.apply(result, focus);
      return;
    }
    this.setBusy(true);
    const view = presentGCounterDemo(result.state);
    const author = view.latestDeliveries[0]?.author;
    if (author === "A" || author === "B" || author === "C") {
      await this.animateHop(
        this.querySelector<HTMLElement>(`[data-client="${author}"]`)!,
        this.querySelector<HTMLElement>("[data-sequencer-node]")!,
        `${gCounterUserName(author)} resend`,
        "outbound",
      );
    }
    const broadcast = this.animateDeliveries(view.latestDeliveries, view);
    this.activeBroadcasts.add(broadcast);
    await broadcast.finally(() => this.activeBroadcasts.delete(broadcast));
    this.apply(result, focus);
    this.showGuidedObservation(
      "Each hiker keeps the largest bird count left by Alice, Bob, and Carol, then adds them.",
      [...this.querySelectorAll<HTMLElement>("[data-total]")],
      "circle",
    );
  }

  private setBusy(busy: boolean): void {
    for (const control of this.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input")) {
      if (control.closest("demo-transport-controls")) continue;
      control.disabled = busy;
    }
  }

  private queueOutbound(author: ReplicaId, label: string): void {
    const now = performance.now();
    const duration = this.transport.nextDuration(HOP_LATENCY_MS);
    const arrivalAt = Math.max(
      now + duration,
      this.lastOutboundArrival + FIFO_GAP_MS / this.transport.speed,
    );
    this.lastOutboundArrival = arrivalAt;
    this.outboundArrivals.push(this.animateHop(
      this.querySelector<HTMLElement>(`[data-client="${author}"]`)!,
      this.querySelector<HTMLElement>("[data-sequencer-node]")!,
      `${gCounterUserName(author)} ${label}`,
      "outbound",
      arrivalAt - now,
    ));
  }

  private launchBroadcast(
    deliveries: ReturnType<typeof presentGCounterDemo>["latestDeliveries"],
    view: ReturnType<typeof presentGCounterDemo>,
    generation: number,
  ): void {
    const broadcast = this.animateDeliveries(deliveries, view, generation);
    this.activeBroadcasts.add(broadcast);
    void broadcast.finally(() => {
      this.activeBroadcasts.delete(broadcast);
      if (generation === this.generation && this.activeBroadcasts.size === 0) {
        this.render();
        this.deliveryFocus?.focus();
        this.showGuidedObservation(
          "Each hiker keeps the largest bird count left by Alice, Bob, and Carol, then adds them.",
          [...this.querySelectorAll<HTMLElement>("[data-total]")],
          "circle",
        );
      }
    });
  }

  private async animateDeliveries(
    deliveries: ReturnType<typeof presentGCounterDemo>["latestDeliveries"],
    view = presentGCounterDemo(this.state),
    generation = this.generation,
  ): Promise<void> {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const operations = new Map<number, typeof deliveries>();
    for (const delivery of deliveries) {
      operations.set(delivery.sequenceNumber, [
        ...(operations.get(delivery.sequenceNumber) ?? []),
        delivery,
      ]);
    }
    for (const [sequenceNumber, operationDeliveries] of operations) {
      const author = operationDeliveries[0]?.author;
      if (!isDemoReplicaId(author)) continue;
      this.querySelector<HTMLElement>('[role="status"]')!.textContent =
        `${gCounterUserName(author)}'s checkpoint note is being delivered to the other hikers.`;
      this.showGuidedObservation(
        `${gCounterUserName(author)}'s latest count is now available at the known checkpoint.`,
        [this.querySelector<HTMLElement>("[data-sequencer-node]")!],
        "box",
      );
      await Promise.all(operationDeliveries.map(async (delivery) => {
        await this.animateHop(
          this.querySelector<HTMLElement>("[data-sequencer-node]")!,
          this.querySelector<HTMLElement>(`[data-client="${delivery.to}"]`)!,
          `${gCounterUserName(author)} note`,
          "sequenced",
        );
        if (
          generation === this.generation &&
          isDemoReplicaId(delivery.to)
        ) {
          this.renderReplica(view, delivery.to);
        }
      }));
    }
  }

  private async animateHop(
    from: HTMLElement,
    to: HTMLElement,
    label: string,
    leg: "outbound" | "sequenced",
    duration = this.transport.nextDuration(HOP_LATENCY_MS),
  ): Promise<void> {
    await animateDemoOperation({
      activeAnimations: this.activeAnimations,
      className: "operation-pulse",
      duration,
      from,
      label: `${label} · ${Math.round(duration)} ms`,
      labelClassName: "operation-pulse-label",
      layer: this.querySelector<HTMLElement>("[data-operation-layer]")!,
      leg,
      startOpacity: 0.3,
      to,
    });
  }

  private resetFlow(): void {
    this.generation += 1;
    this.delivering = false;
    this.lastOutboundArrival = 0;
    this.outboundArrivals = [];
    this.activeBroadcasts.clear();
    this.deliveryFocus = null;
    for (const animation of this.activeAnimations) animation.cancel();
    this.activeAnimations.clear();
    this.querySelector<HTMLElement>("[data-operation-layer]")!.replaceChildren();
  }

  private showGuidedObservation(
    text: string,
    elements: HTMLElement[],
    shape: "circle" | "box" = "box",
  ): void {
    if (!this.guided) return;
    this.clearGuidedMarks();
    this.querySelector<HTMLElement>("[data-guided-callout]")!.textContent = text;
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue("--signal")
      .trim();
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const element of elements) {
      element.dataset.guidedMark = shape;
      const annotation = annotate(element, {
        type: shape,
        color,
        strokeWidth: 2,
        padding: shape === "circle" ? 6 : 3,
        animate: !reducedMotion,
        animationDuration: 450,
      });
      this.guidedAnnotations.push(annotation);
      annotation.show();
    }
    if (elements.length === 0) return;
    this.guidedTimer = window.setTimeout(
      () => this.clearGuidedMarks(),
      Math.max(900, 1400 / this.transport.speed),
    );
  }

  private clearGuidedMarks(): void {
    if (this.guidedTimer !== undefined) window.clearTimeout(this.guidedTimer);
    this.guidedTimer = undefined;
    for (const annotation of this.guidedAnnotations) annotation.remove();
    this.guidedAnnotations = [];
    for (const element of this.querySelectorAll<HTMLElement>("[data-guided-mark]")) {
      delete element.dataset.guidedMark;
    }
  }

  private renderReplica(
    view: ReturnType<typeof presentGCounterDemo>,
    replicaId: ReplicaId,
  ): void {
    const replica = view.replicas.find(({ id }) => id === replicaId);
    if (!replica) return;
    this.querySelector(`[data-total="${replica.id}"]`)!.textContent = String(replica.value);
    this.querySelector(`[data-replica-state="${replica.id}"]`)!.textContent =
      view.pending
        ? replica.value > 0 ? "Local view · notes still in transit" : "Waiting for notes"
        : view.phase === "initial" ? "Connected to checkpoint network" : "All checkpoints agree";
    for (const userCount of replica.counts) {
      this.querySelector(`[data-user-count="${replica.id}-${userCount.replicaId}"]`)!.textContent =
        String(userCount.count);
    }
  }

  private render(renderReplicas = true): void {
    const view = presentGCounterDemo(this.state);
    this.dataset.phase = view.phase;
    if (renderReplicas) {
      for (const replica of view.replicas) this.renderReplica(view, replica.id);
    }
    const operations = new Map<number, { author: ReplicaId; destinations: ReplicaId[] }>();
    for (const delivery of view.deliveries) {
      if (!isDemoReplicaId(delivery.author) || !isDemoReplicaId(delivery.to)) continue;
      const operation = operations.get(delivery.sequenceNumber) ?? {
        author: delivery.author,
        destinations: [],
      };
      operation.destinations.push(delivery.to);
      operations.set(delivery.sequenceNumber, operation);
    }
    const deliveries = this.querySelector<HTMLOListElement>("[data-deliveries]")!;
    deliveries.replaceChildren(...(operations.size
      ? [...operations].reverse().map(([sequenceNumber, operation]) =>
        node(
          "li",
          `${gCounterUserName(operation.author)} left a checkpoint note for ${
            operation.destinations.map(gCounterUserName).join(", ")
          }`,
        ))
      : [node(
        "li",
        view.pending
          ? `${view.queuedOperations} checkpoint ${view.queuedOperations === 1 ? "note" : "notes"} queued.`
          : "No checkpoint note shared yet.",
      )]));
    const sequenceCounter =
      this.querySelector<HTMLOutputElement>("[data-sequence-counter]")!;
    const previousSequence = sequenceCounter.value;
    sequenceCounter.value =
      `${view.sequenceNumber} ${view.sequenceNumber === 1 ? "note" : "notes"}`;
    if (previousSequence !== sequenceCounter.value && view.sequenceNumber > 0) {
      sequenceCounter.classList.remove("stamped");
      void sequenceCounter.offsetWidth;
      sequenceCounter.classList.add("stamped");
    }
    this.querySelector<HTMLElement>('[role="status"]')!.textContent = view.result;
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-increment]")) {
      button.disabled = Boolean(this.roomClient)
        && (!this.roomConnected || button.dataset.replica !== this.roomReplica);
    }
    this.button("race").disabled = Boolean(this.roomClient);
    this.button("race").textContent = this.transport.autoDeliver
      ? "Leave Alice +7 and Bob +3 together"
      : "Hold Alice +7 and Bob +3 notes";
    this.button("resend").disabled =
      Boolean(this.roomClient) || this.delivering || this.activeBroadcasts.size > 0 || !view.canResend;
    this.button("resend").textContent = view.latestAuthor
      ? `Repeat ${gCounterUserName(view.latestAuthor)}'s note`
      : "Repeat latest checkpoint note";
    this.button("reset").disabled = Boolean(this.roomClient)
      && (!this.roomConnected || this.roomReplica === null);
    this.querySelector<HTMLInputElement>("[data-guided-observations]")!.disabled = false;
    this.renderRoom();
  }
}

if (!customElements.get("g-counter-demo")) {
  customElements.define("g-counter-demo", GCounterDemoElement);
}
