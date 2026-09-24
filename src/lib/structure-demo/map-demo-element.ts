import {
  createMapDemo,
  deliverMapDemoOperations,
  mapRaceOperations,
  mapUserName,
  stageMapDemoRace,
  updateMapReplica,
  type MapDemoResult,
  type MapDemoState,
  type MapKind,
  type MapOperation,
  type ReplicaId,
} from "./map-demo";
import {
  autoDeliveryChangeEvent,
  DemoTransportControlsElement,
} from "./demo-transport-controls";

const HOP_LATENCY_MS = 800;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function operationLabel(operation: MapOperation): string {
  if (operation.action === "increment") return `${operation.key} +${operation.value}`;
  if (operation.action === "remove" || operation.action === "rmdir") {
    return `Remove ${operation.key}`;
  }
  return operation.value || operation.key;
}

class MapStructureDemoElement extends HTMLElement {
  private state!: MapDemoState;
  private delivering = false;
  private generation = 0;
  private outboundArrivals: Promise<void>[] = [];
  private activeAnimations = new Set<Animation>();

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    this.state = createMapDemo(this.kind);
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-map-action]")) {
      button.addEventListener("click", () => {
        const folderName = button.closest(".map-replica")
          ?.querySelector<HTMLInputElement>("[data-folder-name]");
        if (this.kind === "shared-directory" && !folderName) {
          throw new Error("Missing directory folder name control");
        }
        if (folderName && !folderName.reportValidity()) return;
        const operation: MapOperation = {
          author: button.dataset.replica as ReplicaId,
          action: button.dataset.mapAction as MapOperation["action"],
          key: folderName?.value ?? button.dataset.mapKey ?? "",
          value: button.dataset.mapValue ?? "",
        };
        const result = updateMapReplica(this.state, operation);
        this.apply(result, button);
        if (!result.ok) return;
        this.renderReplica(operation.author);
        this.queueOutbound(operation);
        if (this.transport.autoDeliver) void this.deliverQueued(button);
      });
    }
    this.button("race").addEventListener("click", () => void this.runRace());
    this.button("reset").addEventListener("click", () => {
      this.resetFlow();
      this.state = createMapDemo(this.kind);
      this.render();
      this.button("race").focus();
    });
    this.transport.addEventListener(autoDeliveryChangeEvent, () => {
      if (this.transport.autoDeliver && this.state.view.pending) {
        void this.deliverQueued(this.transport);
      }
    });
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  private get kind(): MapKind {
    const kind = this.dataset.kind;
    if (
      kind === "shared-map"
      || kind === "lww-map"
      || kind === "or-map"
      || kind === "shared-directory"
    ) return kind;
    throw new Error("Missing map demo kind");
  }

  private button(action: "race" | "reset"): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing map demo ${action} control`);
    return button;
  }

  private get transport(): DemoTransportControlsElement {
    const controls = this.querySelector<DemoTransportControlsElement>(
      "demo-transport-controls",
    );
    if (!controls) throw new Error("Missing map transport controls");
    return controls;
  }

  private async runRace(): Promise<void> {
    this.resetFlow();
    this.state = createMapDemo(this.kind);
    const staged = stageMapDemoRace(this.state);
    this.apply(staged, this.button("race"));
    if (!staged.ok) return;
    for (const operation of mapRaceOperations(this.kind)) this.queueOutbound(operation);
    if (this.transport.autoDeliver) {
      await this.deliverQueued(this.button("race"));
    }
  }

  private async deliverQueued(focus: HTMLElement): Promise<void> {
    if (this.delivering) return;
    this.delivering = true;
    this.renderControls();
    const generation = this.generation;
    try {
      while (this.transport.autoDeliver && this.state.view.pending) {
        await Promise.all(this.outboundArrivals.splice(0));
        if (generation !== this.generation) return;
        const result = deliverMapDemoOperations(this.state);
        if (!result.ok) {
          this.apply(result, focus);
          return;
        }
        this.state = result.state;
        this.render(false);
        await this.animateDeliveries(this.state.latestDeliveries, generation);
        if (generation !== this.generation) return;
        this.render(true);
      }
    } finally {
      if (generation !== this.generation) return;
      this.delivering = false;
      this.renderControls();
      if (this.transport.autoDeliver && this.state.view.pending) {
        void this.deliverQueued(focus);
      }
    }
  }

  private apply(result: MapDemoResult, focus: HTMLElement): void {
    const alert = this.querySelector<HTMLElement>('[role="alert"]')!;
    if (result.ok) {
      this.state = result.state;
      alert.hidden = true;
      alert.textContent = "";
    } else {
      alert.hidden = false;
      alert.textContent = result.error;
    }
    this.render(!this.delivering);
    (result.ok ? focus : this.button("reset")).focus();
  }

  private queueOutbound(operation: MapOperation): void {
    this.outboundArrivals.push(this.animateHop(
      this.querySelector<HTMLElement>(`[data-client="${operation.author}"]`)!,
      this.querySelector<HTMLElement>("[data-relay-node]")!,
      operationLabel(operation),
      "outbound",
    ));
  }

  private async animateDeliveries(
    deliveries: MapDemoState["latestDeliveries"],
    generation: number,
  ): Promise<void> {
    const operations = new Map<number, typeof deliveries>();
    for (const delivery of deliveries) {
      operations.set(delivery.sequenceNumber, [
        ...(operations.get(delivery.sequenceNumber) ?? []),
        delivery,
      ]);
    }
    for (const copies of operations.values()) {
      const operation = copies[0];
      if (!operation) continue;
      await Promise.all(copies.map((delivery) =>
        this.animateHop(
          this.querySelector<HTMLElement>("[data-relay-node]")!,
          this.querySelector<HTMLElement>(`[data-client="${delivery.to}"]`)!,
          operationLabel(operation),
          "shared",
        )));
      if (generation !== this.generation) return;
    }
  }

  private async animateHop(
    from: HTMLElement,
    to: HTMLElement,
    label: string,
    leg: "outbound" | "shared",
  ): Promise<void> {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = this.querySelector<HTMLElement>("[data-operation-layer]")!;
    const root = layer.getBoundingClientRect();
    const start = from.getBoundingClientRect();
    const end = to.getBoundingClientRect();
    const dot = node("span", "");
    dot.className = `map-operation-pulse ${leg}`;
    dot.ariaHidden = "true";
    const dotLabel = node("span", label);
    dotLabel.className = "map-operation-label";
    dot.append(dotLabel);
    layer.append(dot);
    const animation = dot.animate([
      {
        transform: `translate(${start.left + start.width / 2 - root.left - 5}px, ${start.top + start.height / 2 - root.top - 5}px)`,
        opacity: 0.25,
      },
      {
        transform: `translate(${end.left + end.width / 2 - root.left - 5}px, ${end.top + end.height / 2 - root.top - 5}px)`,
        opacity: 1,
      },
    ], {
      duration: this.transport.nextDuration(HOP_LATENCY_MS),
      easing: "ease-in-out",
    });
    this.activeAnimations.add(animation);
    await animation.finished.catch(() => undefined);
    this.activeAnimations.delete(animation);
    dot.remove();
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
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-map-action]")) {
      button.disabled = false;
    }
    for (const input of this.querySelectorAll<HTMLInputElement>("[data-folder-name]")) {
      input.disabled = false;
    }
    this.button("race").disabled = this.delivering;
    this.button("reset").disabled = false;
  }

  private renderReplica(replicaId: ReplicaId): void {
    const replica = this.state.view.replicas.find(({ id }) => id === replicaId);
    if (!replica) return;
    const entries = this.querySelector<HTMLElement>(`[data-map-entries="${replica.id}"]`)!;
    const heading = entries.querySelector(".map-entry-heading");
    entries.replaceChildren(...(heading ? [heading] : []), ...(replica.entries.length
      ? replica.entries.map((entry) => {
        const row = node("div", "");
        row.append(node("dt", entry.key), node("dd", entry.value));
        return row;
      })
      : [Object.assign(node("div", ""), { className: "empty-entry" })]));
    if (!replica.entries.length) {
      entries.lastElementChild!.append(node("dd", this.kind === "shared-directory" ? "No folders" : "No entries"));
    }
    this.querySelector<HTMLElement>(`[data-replica-state="${replica.id}"]`)!.textContent =
      this.state.view.pending
        ? "Local view · operation in transit"
        : replica.entries.length ? "Matches the other notebooks" : this.kind === "shared-directory"
          ? "No folders in this notebook" : "No notes yet";
  }

  private directoryEvidence(): string {
    const directory = this.state.view.replicas[0];
    if (!directory) throw new Error("Missing directory replica");
    const count = directory.entries.length;
    return `Ledger ${this.state.view.sequenceNumber}: ${count} ${count === 1 ? "folder name" : "folder names"} in each notebook.`;
  }

  private render(renderReplicas = true): void {
    if (renderReplicas) {
      for (const replica of this.state.view.replicas) this.renderReplica(replica.id);
    }

    const grouped = new Map<number, typeof this.state.deliveries>();
    for (const delivery of this.state.deliveries) {
      grouped.set(delivery.sequenceNumber, [
        ...(grouped.get(delivery.sequenceNumber) ?? []),
        delivery,
      ]);
    }
    this.querySelector<HTMLOListElement>("[data-history]")!.replaceChildren(
      ...(grouped.size
        ? [...grouped].reverse().map(([, copies]) => {
          const operation = copies[0]!;
          const item = node("li", `${mapUserName(operation.author)} · ${operationLabel(operation)}`);
          if (this.kind === "shared-map") item.value = operation.sequenceNumber;
          return item;
        })
        : [Object.assign(node("li", this.state.view.pending
          ? `${this.state.queuedOperations.length} operations are in transit.`
          : "No operations shared yet."), { className: "empty-history" })]),
    );

    const evidence = this.querySelector<HTMLElement>("[data-evidence]")!;
    evidence.textContent = this.kind === "shared-map"
      ? this.state.deliveries.length
        ? `Change #${this.state.deliveries.at(-1)!.sequenceNumber} to ${this.state.deliveries.at(-1)!.key} is the latest for that line.`
        : "No operations shared yet."
      : this.kind === "lww-map"
        ? this.state.deliveries.length
          ? "Carol compares the times beside gate-status and reads Trail closed, regardless of delivery order."
          : "No timestamped race delivered yet."
        : this.kind === "or-map"
          ? this.state.deliveries.length
            ? "Alice crossed out the entry she saw; Bob's new note of 3 crates remains."
            : "The baseline tally is 5 crates."
          : this.state.deliveries.length
            ? this.directoryEvidence()
            : "No folder has been made yet.";
    const operationCount = new Set(
      this.state.deliveries.map(({ sequenceNumber }) => sequenceNumber),
    ).size;
    this.querySelector<HTMLOutputElement>("[data-message-count]")!.value =
      `${operationCount} ${operationCount === 1 ? "operation" : "operations"} shared`;
    this.querySelector<HTMLElement>('[role="status"]')!.textContent = this.state.result;
    this.renderControls();
  }
}

if (!customElements.get("map-structure-demo")) {
  customElements.define("map-structure-demo", MapStructureDemoElement);
}
