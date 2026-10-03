import {
  createSharedCounterDemo,
  createLiveSharedCounterDemo,
  deliverNextSharedOperation,
  formatSigned,
  isSharedReplicaId,
  presentSharedCounterDemo,
  sharedCounterUserName,
  stageSharedRace,
  updateSharedReplica,
  receiveSharedCounterOperation,
  rollbackSharedChanges,
  type ReplicaId,
  type SharedCounterDemoResult,
  type SharedCounterDemoState,
} from "./shared-counter";
import {
  autoDeliveryChangeEvent,
  DemoTransportControlsElement,
} from "./demo-transport-controls";
import { animateDemoOperation } from "./demo-operation-flight";
import { SharedCounterRoomClient } from "./shared-counter-room-client";
import { normalizeRoomCode } from "./room-socket";
import { MAX_SHARED_OPERATIONS, type SharedCounterHistory } from "../../../worker/shared-counter-protocol";

type Action = "race" | "reset";
const HOP_LATENCY_MS = 1000;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

class SharedCounterDemoElement extends HTMLElement {
  private state: SharedCounterDemoState = createSharedCounterDemo();
  private delivering = false;
  private generation = 0;
  private outboundArrivals: Promise<void>[] = [];
  private activeAnimations = new Set<Animation>();
  private roomClient?: SharedCounterRoomClient;
  private roomCode = "";
  private roomReplica: ReplicaId | null = null;
  private roomConnected = false;
  private roomPresence = 0;

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-update]")) {
      button.addEventListener("click", () => {
        const replica = button.dataset.replica as ReplicaId;
        const amount = Number(button.dataset.update);
        if (this.roomClient && (!this.roomConnected || replica !== this.roomReplica)) return;
        const result = updateSharedReplica(this.state, replica, amount);
        this.apply(result, button);
        if (!result.ok) return;
        this.renderReplica(presentSharedCounterDemo(this.state), replica);
        if (this.roomClient && this.state.mode === "live") {
          const change = this.state.live.pending.at(-1)!;
          try {
            this.roomClient.submit(change.id, change.amount);
          } catch (error) {
            this.apply(rollbackSharedChanges(this.state), button);
            this.roomStatus(error instanceof Error ? error.message : String(error));
            return;
          }
        }
        this.queueOutbound(replica, `${sharedCounterUserName(replica)} ${formatSigned(amount)}`);
        if (this.transport.autoDeliver) void this.deliverQueued(button);
      });
    }
    this.button("race").addEventListener("click", async () => {
      await this.runRace();
    });
    this.button("reset").addEventListener("click", () => {
      if (this.roomClient) {
        try {
          this.roomClient.reset();
        } catch (error) {
          this.roomStatus(error instanceof Error ? error.message : String(error));
        }
        return;
      }
      this.resetFlow();
      this.state = createSharedCounterDemo();
      this.render();
      this.button("race").focus();
    });
    this.transport.addEventListener(autoDeliveryChangeEvent, () => {
      if (
        this.transport.autoDeliver &&
        presentSharedCounterDemo(this.state).canDeliver
      ) {
        void this.deliverQueued(this.transport);
      }
    });
    this.setupRoom();
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  disconnectedCallback(): void {
    this.roomClient?.close();
    this.resetFlow();
  }

  private roomButton(action: "create" | "join" | "copy" | "leave"): HTMLButtonElement {
    return this.querySelector<HTMLButtonElement>(`[data-room-action="${action}"]`)!;
  }

  private setupRoom(): void {
    const input = this.querySelector<HTMLInputElement>("[data-room-code]")!;
    input.addEventListener("input", () => {
      input.value = normalizeRoomCode(input.value);
      this.renderRoom();
    });
    this.roomButton("create").addEventListener("click", () => {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      input.value = [...crypto.getRandomValues(new Uint8Array(6))]
        .map((value) => alphabet[value % alphabet.length]).join("");
      this.connectRoom(input.value);
    });
    this.roomButton("join").addEventListener("click", () => this.connectRoom(input.value));
    this.roomButton("leave").addEventListener("click", () => {
      this.roomClient?.close();
      this.roomClient = undefined;
      this.roomConnected = false;
      this.roomReplica = null;
      this.resetFlow();
      this.state = createSharedCounterDemo();
      const url = new URL(location.href);
      url.searchParams.delete("room");
      history.replaceState(null, "", url);
      this.render();
      this.roomStatus("Left the live room. This browser now controls all three hikers in a fresh local demo.");
    });
    this.roomButton("copy").addEventListener("click", async () => {
      try {
        const url = new URL(location.href);
        url.searchParams.set("room", this.roomCode);
        await navigator.clipboard.writeText(url.toString());
        this.roomStatus(`Copied the link for room ${this.roomCode}.`);
      } catch (error) {
        this.roomStatus(error instanceof Error ? error.message : String(error));
      }
    });
    const requested = normalizeRoomCode(new URL(location.href).searchParams.get("room") ?? "");
    if (requested.length >= 4) {
      input.value = requested;
      this.connectRoom(requested);
    } else {
      this.roomStatus("Create a room, or enter a room code from another hiker.");
      this.renderRoom();
    }
  }

  private connectRoom(code: string): void {
    const room = normalizeRoomCode(code);
    if (room.length < 4) {
      this.roomStatus("Enter a room code with at least four letters or numbers.");
      return;
    }
    this.roomClient?.close();
    this.resetFlow();
    this.roomCode = room;
    this.roomReplica = null;
    this.roomConnected = false;
    this.roomClient = new SharedCounterRoomClient(location.origin, {
      hello: (message) => {
        this.restoreRoom(message);
        this.roomReplica = message.replica;
        this.roomPresence = message.connected;
        this.roomConnected = true;
        const url = new URL(location.href);
        url.searchParams.set("room", room);
        history.replaceState(null, "", url);
        this.render();
      },
      operation: (operation) => {
        const result = receiveSharedCounterOperation(this.state, operation);
        if (!result.ok) throw new Error(result.error);
        this.state = result.state;
        this.render(!this.delivering);
        if (this.transport.autoDeliver) void this.deliverQueued(this.transport);
      },
      reset: (history) => {
        this.restoreRoom(history);
        this.roomStatus(`Room ${room} was reset to 10. Earlier changes were discarded.`);
      },
      rejected: (message, history) => {
        const rolledBack = rollbackSharedChanges(this.state, true);
        if (!rolledBack.ok) throw new Error(rolledBack.error);
        this.state = rolledBack.state;
        this.restoreRoom(history);
        this.roomStatus(`${message} Reloaded the stored log; unconfirmed local changes were discarded.`);
      },
      presence: (connected) => {
        this.roomPresence = connected;
        this.renderRoom();
      },
      status: (message) => this.roomStatus(message),
      closed: () => {
        this.roomConnected = false;
        this.roomReplica = null;
        this.render();
        this.roomStatus(`Disconnected from room ${room}. Values may include unconfirmed changes. Rejoin to load the stored log.`);
      },
    });
    this.render();
    this.roomStatus(`Connecting to room ${room}...`);
    this.roomClient.connect(room);
  }

  private restoreRoom(history: SharedCounterHistory): void {
    this.resetFlow();
    this.state = createLiveSharedCounterDemo(history.operations);
    this.querySelector<HTMLElement>('[role="alert"]')!.hidden = true;
    this.render();
  }

  private roomStatus(message: string): void {
    this.querySelector<HTMLElement>("[data-room-status]")!.textContent = message;
  }

  private renderRoom(): void {
    const input = this.querySelector<HTMLInputElement>("[data-room-code]")!;
    input.disabled = this.roomConnected;
    this.roomButton("create").disabled = this.roomConnected;
    this.roomButton("join").disabled = this.roomConnected || normalizeRoomCode(input.value).length < 4;
    this.roomButton("copy").disabled = !this.roomConnected;
    this.roomButton("leave").disabled = !this.roomClient;
    if (!this.roomConnected) return;
    const role = this.roomReplica
      ? `This device controls ${sharedCounterUserName(this.roomReplica)}.`
      : "This device is observing because Alice, Bob, and Carol are connected.";
    let waiting = "";
    if (this.state.mode === "live" && this.state.live.pending.length > 0) {
      const { pending, incoming } = this.state.live;
      waiting = pending.some(({ id }) => !incoming.some((operation) => operation.id === id))
        ? " Local changes are waiting for a sequence number."
        : " Numbered changes are waiting for local delivery.";
    }
    if (this.state.mode === "live" && this.state.view.sequenceNumber >= MAX_SHARED_OPERATIONS) {
      waiting += " This room has 1,000 operations. A hiker can reset it to continue.";
    }
    this.roomStatus(`Room ${this.roomCode}: ${role} ${this.roomPresence} ${this.roomPresence === 1 ? "device" : "devices"} connected.${waiting}`);
  }

  private button(action: Action): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing SharedCounter ${action} control`);
    return button;
  }

  private get transport(): DemoTransportControlsElement {
    const controls = this.querySelector<DemoTransportControlsElement>(
      "demo-transport-controls",
    );
    if (!controls) throw new Error("Missing SharedCounter transport controls");
    return controls;
  }

  private async runRace(): Promise<void> {
    if (this.roomClient) return;
    this.resetFlow();
    this.state = createSharedCounterDemo();
    const staged = stageSharedRace(this.state);
    if (!staged.ok) {
      this.apply(staged, this.button("race"));
      return;
    }
    this.state = staged.state;
    this.render();
    this.queueOutbound("A", "Alice +3");
    this.queueOutbound("B", "Bob -1");
    if (this.transport.autoDeliver) {
      await this.deliverQueued(this.button("race"));
    }
  }

  private async deliverQueued(focus: HTMLElement): Promise<void> {
    if (this.delivering || (this.roomClient && !this.roomConnected)) return;
    this.delivering = true;
    this.renderControls();
    const generation = this.generation;
    try {
      const broadcasts: Promise<void>[] = [];
      while (
        this.transport.autoDeliver &&
        presentSharedCounterDemo(this.state).canDeliver
      ) {
        while (this.outboundArrivals.length > 0) {
          await Promise.all(this.outboundArrivals.splice(0));
          if (generation !== this.generation) return;
        }
        const result = deliverNextSharedOperation(this.state);
        if (!result.ok) {
          this.apply(result, focus);
          if (this.roomClient) {
            this.roomClient.close();
            this.roomConnected = false;
            this.renderControls();
            this.roomStatus(`${result.error} Rejoin the room to recover the stored log.`);
          }
          return;
        }
        this.state = result.state;
        const view = presentSharedCounterDemo(this.state);
        this.render(false);
        broadcasts.push(this.animateDeliveries(view.latestDeliveries, generation));
      }
      await Promise.all(broadcasts);
      if (generation !== this.generation) return;
      this.render(true);
    } finally {
      if (generation !== this.generation) return;
      this.delivering = false;
      this.renderControls();
      if (
        this.transport.autoDeliver &&
        presentSharedCounterDemo(this.state).canDeliver
      ) {
        void this.deliverQueued(focus);
      }
    }
  }

  private apply(result: SharedCounterDemoResult, focus: HTMLElement): void {
    const alert = this.querySelector<HTMLElement>('[role="alert"]')!;
    if (result.ok) {
      this.state = result.state;
      alert.hidden = true;
      alert.textContent = "";
    } else {
      alert.textContent = result.error;
      alert.hidden = false;
    }
    this.render(!this.delivering);
    (result.ok ? focus : this.button("reset")).focus();
  }

  private queueOutbound(author: ReplicaId, label: string): void {
    this.outboundArrivals.push(this.animateHop(
      this.querySelector<HTMLElement>(`[data-client="${author}"]`)!,
      this.querySelector<HTMLElement>("[data-sequencer-node]")!,
      label,
      "outbound",
    ));
  }

  private async animateDeliveries(
    deliveries: ReturnType<typeof presentSharedCounterDemo>["latestDeliveries"],
    generation: number,
  ): Promise<void> {
    const operation = deliveries[0];
    if (!operation || !isSharedReplicaId(operation.author)) return;
    this.querySelector<HTMLElement>('[role="status"]')!.textContent =
      `The ranger stamped ${formatSigned(operation.amount)} as SN ${operation.sequenceNumber} and is broadcasting it.`;
    await Promise.all(deliveries.map((delivery) =>
      this.animateHop(
        this.querySelector<HTMLElement>("[data-sequencer-node]")!,
        this.querySelector<HTMLElement>(`[data-client="${delivery.to}"]`)!,
        `SN ${operation.sequenceNumber} · ${formatSigned(operation.amount)}`,
        "sequenced",
      )));
    if (generation !== this.generation) return;
  }

  private async animateHop(
    from: HTMLElement,
    to: HTMLElement,
    label: string,
    leg: "outbound" | "sequenced",
  ): Promise<void> {
    const duration = this.transport.nextDuration(HOP_LATENCY_MS);
    await animateDemoOperation({
      activeAnimations: this.activeAnimations,
      className: "shared-operation-pulse",
      duration,
      from,
      label: `${label} · ${Math.round(duration)} ms`,
      labelClassName: "shared-operation-label",
      layer: this.querySelector<HTMLElement>("[data-operation-layer]")!,
      leg,
      startOpacity: 0.3,
      to,
    });
  }

  private resetFlow(): void {
    this.generation += 1;
    this.delivering = false;
    this.outboundArrivals = [];
    for (const animation of this.activeAnimations) animation.cancel();
    this.activeAnimations.clear();
    this.querySelector<HTMLElement>("[data-operation-layer]")!.replaceChildren();
  }

  private renderControls(): void {
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-update]")) {
      button.disabled = !!this.roomClient && (!this.roomConnected
        || button.dataset.replica !== this.roomReplica
        || this.state.view.sequenceNumber >= MAX_SHARED_OPERATIONS);
    }
    this.button("race").disabled = this.delivering || !!this.roomClient;
    this.button("reset").disabled = !!this.roomClient && (!this.roomConnected || !this.roomReplica);
    this.renderRoom();
  }

  private renderReplica(
    view: ReturnType<typeof presentSharedCounterDemo>,
    replicaId: ReplicaId,
  ): void {
    const replica = view.replicas.find(({ id }) => id === replicaId);
    if (!replica) return;
    this.querySelector(`[data-shared-total="${replica.id}"]`)!.textContent =
      String(replica.value);
    this.querySelector(`[data-replica-state="${replica.id}"]`)!.textContent =
      replica.optimistic
        ? "Optimistic local view"
        : view.phase === "initial"
          ? "Applied through baseline"
          : `Applied through SN ${replica.lastAppliedSequence}`;
  }

  private render(renderReplicas = true): void {
    const view = presentSharedCounterDemo(this.state);
    this.dataset.phase = view.phase;
    if (renderReplicas) {
      for (const replica of view.replicas) this.renderReplica(view, replica.id);
    }
    const log = this.querySelector<HTMLOListElement>("[data-operation-log]")!;
    log.replaceChildren(...(view.operations.length
      ? [...view.operations].reverse().map((operation) =>
        node(
          "li",
          `SN ${operation.sequenceNumber} · ${sharedCounterUserName(operation.author)} ${formatSigned(operation.amount)}`,
        ))
      : [node(
        "li",
        view.canDeliver
          ? `${view.queuedOperations} unnumbered ${view.queuedOperations === 1 ? "note is" : "notes are"} in transit.`
          : "No signed change sequenced yet.",
      )]));
    this.querySelector<HTMLOutputElement>("[data-sequence-counter]")!.value =
      `SN ${view.sequenceNumber}`;
    this.querySelector<HTMLElement>('[role="status"]')!.textContent = view.result;
    this.renderControls();
  }
}

if (!customElements.get("shared-counter-demo")) {
  customElements.define("shared-counter-demo", SharedCounterDemoElement);
}
