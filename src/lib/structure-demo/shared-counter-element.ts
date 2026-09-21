import {
  createSharedCounterDemo,
  deliverNextSharedOperation,
  formatSigned,
  isSharedReplicaId,
  presentSharedCounterDemo,
  sharedCounterUserName,
  stageSharedRace,
  updateSharedReplica,
  type ReplicaId,
  type SharedCounterDemoResult,
  type SharedCounterDemoState,
} from "./shared-counter";

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

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-update]")) {
      button.addEventListener("click", () => {
        const replica = button.dataset.replica as ReplicaId;
        const amount = Number(button.dataset.update);
        const result = updateSharedReplica(this.state, replica, amount);
        this.apply(result, button);
        if (!result.ok) return;
        this.renderReplica(presentSharedCounterDemo(this.state), replica);
        this.queueOutbound(replica, `${sharedCounterUserName(replica)} ${formatSigned(amount)}`);
        void this.deliverQueued(button);
      });
    }
    this.button("race").addEventListener("click", async () => {
      await this.runRace();
    });
    this.button("reset").addEventListener("click", () => {
      this.resetFlow();
      this.state = createSharedCounterDemo();
      this.render();
      this.button("race").focus();
    });
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  private button(action: Action): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing SharedCounter ${action} control`);
    return button;
  }

  private async runRace(): Promise<void> {
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
    await this.deliverQueued(this.button("race"));
  }

  private async deliverQueued(focus: HTMLButtonElement): Promise<void> {
    if (this.delivering) return;
    this.delivering = true;
    this.renderControls();
    const generation = this.generation;
    try {
      while (presentSharedCounterDemo(this.state).canDeliver) {
        while (this.outboundArrivals.length > 0) {
          await Promise.all(this.outboundArrivals.splice(0));
          if (generation !== this.generation) return;
        }
        const result = deliverNextSharedOperation(this.state);
        if (!result.ok) {
          this.apply(result, focus);
          return;
        }
        this.state = result.state;
        const view = presentSharedCounterDemo(this.state);
        this.render(false);
        await this.animateDeliveries(view.latestDeliveries, generation);
        if (generation !== this.generation) return;
        this.render(true);
      }
    } finally {
      if (generation !== this.generation) return;
      this.delivering = false;
      this.renderControls();
      if (presentSharedCounterDemo(this.state).canDeliver) {
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
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = this.querySelector<HTMLElement>("[data-operation-layer]")!;
    const root = layer.getBoundingClientRect();
    const start = from.getBoundingClientRect();
    const end = to.getBoundingClientRect();
    const dot = node("span", "");
    dot.className = `shared-operation-pulse ${leg}`;
    dot.dataset.leg = leg;
    dot.ariaHidden = "true";
    const dotLabel = node("span", `${label} · ${HOP_LATENCY_MS} ms`);
    dotLabel.className = "shared-operation-label";
    dot.append(dotLabel);
    layer.append(dot);
    const animation = dot.animate([
      {
        transform: `translate(${start.left + start.width / 2 - root.left - 5}px, ${start.top + start.height / 2 - root.top - 5}px)`,
        opacity: 0.3,
      },
      {
        transform: `translate(${end.left + end.width / 2 - root.left - 5}px, ${end.top + end.height / 2 - root.top - 5}px)`,
        opacity: 1,
      },
    ], {
      duration: HOP_LATENCY_MS,
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
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-update]")) {
      button.disabled = false;
    }
    this.button("race").disabled = this.delivering;
    this.button("reset").disabled = false;
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
      view.canDeliver
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
          ? `${view.queuedOperations} unnumbered ${view.queuedOperations === 1 ? "note is" : "notes are"} traveling.`
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
