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
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-register-value]")) {
      button.addEventListener("click", () => {
        const operation: RegisterOperation = {
          author: button.dataset.replica as ReplicaId,
          value: button.dataset.registerValue ?? "",
        };
        const result = updateRegisterReplica(this.state, operation);
        this.apply(result, button);
        if (!result.ok) return;
        this.renderReplica(operation.author);
        this.queueOutbound(operation);
        void this.deliverQueued(button);
      });
    }
    this.button("race").addEventListener("click", () => void this.runRace());
    this.button("reset").addEventListener("click", () => {
      this.resetFlow();
      this.state = createRegisterDemo(this.kind);
      this.render();
      this.button("race").focus();
    });
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  private get kind(): RegisterKind {
    const kind = this.dataset.kind;
    if (
      kind === "lww-register"
      || kind === "mv-register"
      || kind === "register-collection"
    ) return kind;
    throw new Error("Missing register demo kind");
  }

  private button(action: "race" | "reset"): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing register demo ${action} control`);
    return button;
  }

  private async runRace(): Promise<void> {
    this.resetFlow();
    this.state = createRegisterDemo(this.kind);
    const staged = stageRegisterRace(this.state);
    this.apply(staged, this.button("race"));
    if (!staged.ok) return;
    for (const operation of registerRaceOperations()) this.queueOutbound(operation);
    await this.deliverQueued(this.button("race"));
  }

  private async deliverQueued(focus: HTMLButtonElement): Promise<void> {
    if (this.delivering) return;
    this.delivering = true;
    this.renderControls();
    const generation = this.generation;
    try {
      while (this.state.view.pending > 0) {
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
      if (this.state.view.pending > 0) void this.deliverQueued(focus);
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
      operation.value,
      "outbound",
    ));
  }

  private async animateDeliveries(
    operations: RegisterOperation[],
    generation: number,
  ): Promise<void> {
    for (const operation of operations) {
      await Promise.all((["A", "B", "C"] as const).map((replica) =>
        this.animateHop(
          this.querySelector<HTMLElement>("[data-relay-node]")!,
          this.querySelector<HTMLElement>(`[data-client="${replica}"]`)!,
          operation.value,
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
    dot.className = `register-operation-pulse ${leg}`;
    dot.ariaHidden = "true";
    const dotLabel = node("span", label);
    dotLabel.className = "register-operation-label";
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
    ], { duration: HOP_LATENCY_MS, easing: "ease-in-out" });
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
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-register-value]")) {
      button.disabled = false;
    }
    this.button("race").disabled = this.delivering;
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
      : [node("em", "No status")]));
    this.querySelector<HTMLElement>(`[data-replica-state="${replica.id}"]`)!.textContent =
      this.state.view.pending > 0
        ? this.kind === "register-collection"
          ? "Write pending · not visible"
          : "Local view · write in transit"
        : replica.values.length > 1
          ? `${replica.values.length} concurrent alternatives`
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
      ? [...this.state.history].reverse().map((operation) =>
        node("li", `${registerUserName(operation.author)} wrote ${operation.value}`))
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
      evidence.textContent = this.state.view.versions.length
        ? `Atomic: ${this.state.view.atomicValue} · Latest: ${this.state.view.latestValue} · ${this.state.view.versions.length} versions retained.`
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
