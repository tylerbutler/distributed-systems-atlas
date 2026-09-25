import {
  createRegisterDemo,
  deliverRegisterOperations,
  registerRaceOperations,
  registerUserName,
  stageRegisterRace,
  updateRegisterReplica,
  type RegisterDemoResult,
  type RegisterDemoState,
  type RegisterKind,
  type RegisterOperation,
  type ReplicaId,
} from "./register-demo";
import {
  autoDeliveryChangeEvent,
  DemoTransportControlsElement,
} from "./demo-transport-controls";
import { animateDemoOperation } from "./demo-operation-flight";
import { REPLICA_IDS } from "./replicas";

const HOP_LATENCY_MS = 800;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

class RegisterStructureDemoElement extends HTMLElement {
  private state!: RegisterDemoState;
  private delivering = false;
  private generation = 0;
  private outboundArrivals: Promise<void>[] = [];
  private activeAnimations = new Set<Animation>();

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    this.state = createRegisterDemo(this.kind);
    for (const form of this.querySelectorAll<HTMLFormElement>("[data-register-form]")) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const button = form.querySelector<HTMLButtonElement>("[data-register-write]")!;
        const input = form.querySelector<HTMLSelectElement>("[data-register-input]")!;
        const key = form.querySelector<HTMLSelectElement>("[data-register-key]");
        const operation: RegisterOperation = {
          author: form.dataset.replica as ReplicaId,
          key: key?.value ?? "trail-status",
          value: input.value,
        };
        const result = updateRegisterReplica(this.state, operation);
        this.apply(result, button);
        if (!result.ok) return;
        this.renderReplica(operation.author);
        this.queueOutbound(operation);
        if (this.transport.autoDeliver) void this.deliverQueued(button);
      });
    }
    this.button("race").addEventListener("click", () => void this.runRace());
    this.querySelector<HTMLButtonElement>('[data-action="follow-up"]')
      ?.addEventListener("click", () => void this.runFollowUp());
    this.button("reset").addEventListener("click", () => {
      this.resetFlow();
      this.state = createRegisterDemo(this.kind);
      this.render();
      this.button("race").focus();
    });
    this.transport.addEventListener(autoDeliveryChangeEvent, () => {
      if (this.transport.autoDeliver && this.state.view.pending > 0) {
        void this.deliverQueued(this.transport);
      }
    });
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  private get kind(): RegisterKind {
    const kind = this.dataset.kind;
    if (
      kind === "lww-register"
      || kind === "mv-register"
      || kind === "register-map"
    ) return kind;
    throw new Error("Missing register demo kind");
  }

  private button(action: "race" | "reset" | "follow-up"): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing register demo ${action} control`);
    return button;
  }

  private get transport(): DemoTransportControlsElement {
    const controls = this.querySelector<DemoTransportControlsElement>(
      "demo-transport-controls",
    );
    if (!controls) throw new Error("Missing register transport controls");
    return controls;
  }

  private async runRace(): Promise<void> {
    this.resetFlow();
    this.state = createRegisterDemo(this.kind);
    const staged = stageRegisterRace(this.state);
    this.apply(staged, this.button("race"));
    if (!staged.ok) return;
    for (const operation of registerRaceOperations(this.kind)) {
      this.queueOutbound(operation);
    }
    if (this.transport.autoDeliver) {
      await this.deliverQueued(this.button("race"));
    }
  }

  private async runFollowUp(): Promise<void> {
    const button = this.button("follow-up");
    const operation: RegisterOperation = {
      author: "C",
      key: "trail-status",
      value: "Inspect bridge",
    };
    const result = updateRegisterReplica(this.state, operation);
    this.apply(result, button);
    if (!result.ok) return;
    this.renderReplica(operation.author);
    this.queueOutbound(operation);
    if (this.transport.autoDeliver) await this.deliverQueued(button);
  }

  private async deliverQueued(focus: HTMLElement): Promise<void> {
    if (this.delivering) return;
    this.delivering = true;
    this.renderControls();
    const generation = this.generation;
    try {
      while (this.transport.autoDeliver && this.state.view.pending > 0) {
        await Promise.all(this.outboundArrivals.splice(0));
        if (generation !== this.generation) return;
        const operations = [...this.state.queuedOperations];
        const result = deliverRegisterOperations(this.state);
        if (!result.ok) {
          this.apply(result, focus);
          return;
        }
        this.state = result.state;
        this.render(false);
        await this.animateDeliveries(operations, generation);
        if (generation !== this.generation) return;
        this.render(true);
      }
    } finally {
      if (generation !== this.generation) return;
      this.delivering = false;
      this.renderControls();
      if (this.transport.autoDeliver && this.state.view.pending > 0) {
        void this.deliverQueued(focus);
      }
    }
  }

  private apply(result: RegisterDemoResult, focus: HTMLElement): void {
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

  private queueOutbound(operation: RegisterOperation): void {
    this.outboundArrivals.push(this.animateHop(
      this.querySelector<HTMLElement>(`[data-client="${operation.author}"]`)!,
      this.querySelector<HTMLElement>("[data-relay-node]")!,
      this.kind === "register-map"
        ? `${operation.key}: ${operation.value}`
        : operation.value,
      "outbound",
    ));
  }

  private async animateDeliveries(
    operations: RegisterOperation[],
    generation: number,
  ): Promise<void> {
    await Promise.all(operations.flatMap((operation) =>
      REPLICA_IDS.map((replica) =>
        this.animateHop(
          this.querySelector<HTMLElement>("[data-relay-node]")!,
          this.querySelector<HTMLElement>(`[data-client="${replica}"]`)!,
          this.kind === "register-map"
            ? `${operation.key}: ${operation.value}`
            : operation.value,
          "shared",
        ))
    ));
    if (generation !== this.generation) return;
  }

  private async animateHop(
    from: HTMLElement,
    to: HTMLElement,
    label: string,
    leg: "outbound" | "shared",
  ): Promise<void> {
    await animateDemoOperation({
      activeAnimations: this.activeAnimations,
      className: "register-operation-pulse",
      duration: this.transport.nextDuration(HOP_LATENCY_MS),
      from,
      label,
      labelClassName: "register-operation-label",
      layer: this.querySelector<HTMLElement>("[data-operation-layer]")!,
      leg,
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
    for (const input of this.querySelectorAll<HTMLSelectElement>("[data-register-input]")) {
      input.disabled = false;
    }
    for (const input of this.querySelectorAll<HTMLSelectElement>("[data-register-key]")) {
      input.disabled = false;
    }
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-register-write]")) {
      button.disabled = false;
    }
    this.button("race").disabled = this.delivering;
    const followUp = this.querySelector<HTMLButtonElement>('[data-action="follow-up"]');
    if (followUp) {
      followUp.disabled = this.delivering
        || this.state.view.pending > 0
        || this.state.view.sequenceNumber < 3
        || this.state.view.atomicValue === "Inspect bridge";
    }
    this.button("reset").disabled = false;
  }

  private renderReplica(replicaId: ReplicaId): void {
    const replica = this.state.view.replicas.find(({ id }) => id === replicaId);
    if (!replica) return;
    const values = this.querySelector<HTMLElement>(
      `[data-register-values="${replica.id}"]`,
    )!;
    values.replaceChildren(...(replica.values.length
      ? replica.values.map((value) => node("span", value))
      : [node("em", this.kind === "register-map" ? "No fields" : "No status")]));
    this.querySelector<HTMLElement>(`[data-replica-state="${replica.id}"]`)!.textContent =
      this.state.view.pending > 0
        ? this.kind === "register-map"
          ? "Write pending · not visible"
          : "Local view · write in transit"
        : replica.values.length > 1
          ? this.kind === "register-map"
            ? `${replica.values.length} named fields`
            : `${replica.values.length} concurrent alternatives`
          : replica.values.length === 1
            ? "One visible value"
            : "No status received";
  }

  private render(renderReplicas = true): void {
    if (renderReplicas) {
      for (const replica of this.state.view.replicas) this.renderReplica(replica.id);
    }

    const history = this.querySelector<HTMLOListElement>("[data-history]")!;
    history.replaceChildren(...(this.state.history.length
      ? [...this.state.history].reverse().map((operation, index) =>
        node(
          "li",
          `SN ${this.state.view.sequenceNumber - index} · ${registerUserName(operation.author)} wrote ${operation.key}: ${operation.value}`,
        ))
      : [node("li", this.state.view.pending > 0
        ? `${this.state.queuedOperations.length} writes are in transit.`
        : "No writes shared yet.")]));

    const evidence = this.querySelector<HTMLElement>("[data-evidence]")!;
    if (this.kind === "lww-register") {
      evidence.textContent = this.state.view.winnerAuthor
        ? `Sequence ${this.state.view.timestamp} · ${registerUserName(
          this.state.view.winnerAuthor as ReplicaId,
        )}'s write wins.`
        : "No sequenced write yet.";
    } else if (this.kind === "mv-register") {
      const count = this.state.view.replicas[0]?.values.length ?? 0;
      evidence.textContent = count
        ? `${count} ${count === 1 ? "alternative" : "concurrent alternatives"} retained.`
        : "No alternatives yet.";
    } else {
      const count = this.state.view.versions.length;
      evidence.textContent = count
        ? `Atomic: ${this.state.view.atomicValue} · Latest: ${this.state.view.latestValue} · ${count} ${count === 1 ? "version" : "versions"} retained.`
        : "No sequenced versions yet.";
    }

    this.querySelector<HTMLOutputElement>("[data-message-count]")!.value =
      `${this.state.history.length} ${this.state.history.length === 1 ? "write" : "writes"} shared`;
    this.querySelector<HTMLElement>('[role="status"]')!.textContent = this.state.result;
    this.renderControls();
  }
}

if (!customElements.get("register-structure-demo")) {
  customElements.define("register-structure-demo", RegisterStructureDemoElement);
}
