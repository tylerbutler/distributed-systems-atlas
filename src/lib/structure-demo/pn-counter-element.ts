import {
  createPNCounterDemo,
  deliverPNOperations,
  pnCounterComponentCount,
  pnCounterComponentIds,
  pnCounterUserName,
  presentPNCounterDemo,
  stageCorrectionRace,
  updatePNReplica,
  type PNCounterDemoResult,
  type PNCounterDemoState,
  type ReplicaId,
} from "./pn-counter";

type Action = "race" | "deliver" | "reset";
const HOP_LATENCY_MS = 1000;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function isReplicaId(value: string): value is ReplicaId {
  return value === "A" || value === "B" || value === "C";
}

function signed(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

class PNCounterDemoElement extends HTMLElement {
  private state: PNCounterDemoState = createPNCounterDemo();
  private busy = false;
  private generation = 0;
  private activeAnimations = new Set<Animation>();

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-update]")) {
      button.addEventListener("click", async () => {
        const replica = button.dataset.replica as ReplicaId;
        const amount = Number(button.dataset.update);
        const result = updatePNReplica(this.state, replica, amount);
        this.apply(result, button);
        if (result.ok) {
          await this.animateHop(
            this.querySelector<HTMLElement>(`[data-client="${replica}"]`)!,
            this.querySelector<HTMLElement>("[data-sequencer-node]")!,
            `${pnCounterUserName(replica)} ${signed(amount)}`,
            "outbound",
          );
        }
      });
    }
    this.button("race").addEventListener("click", async () => {
      await this.runRace();
    });
    this.button("deliver").addEventListener("click", async () => {
      await this.deliverQueued(this.button("deliver"));
    });
    this.button("reset").addEventListener("click", () => {
      this.resetFlow();
      this.state = createPNCounterDemo();
      this.render();
      this.button("race").focus();
    });
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  private button(action: Action): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing PN-counter ${action} control`);
    return button;
  }

  private async runRace(): Promise<void> {
    this.resetFlow();
    this.state = createPNCounterDemo();
    const staged = stageCorrectionRace(this.state);
    if (!staged.ok) {
      this.apply(staged, this.button("race"));
      return;
    }
    this.state = staged.state;
    this.render();
    await Promise.all([
      this.animateHop(
        this.querySelector<HTMLElement>('[data-client="A"]')!,
        this.querySelector<HTMLElement>("[data-sequencer-node]")!,
        "Alice +3",
        "outbound",
      ),
      this.animateHop(
        this.querySelector<HTMLElement>('[data-client="B"]')!,
        this.querySelector<HTMLElement>("[data-sequencer-node]")!,
        "Bob -1",
        "outbound",
      ),
    ]);
    await this.deliverQueued(this.button("race"));
  }

  private async deliverQueued(focus: HTMLElement): Promise<void> {
    const result = deliverPNOperations(this.state);
    if (!result.ok) {
      this.apply(result, focus);
      return;
    }
    this.setBusy(true);
    const generation = this.generation;
    const view = presentPNCounterDemo(result.state);
    await this.animateDeliveries(view.latestDeliveries, generation);
    if (generation !== this.generation) return;
    this.state = result.state;
    this.setBusy(false);
    this.render();
    focus.focus();
  }

  private apply(result: PNCounterDemoResult, focus: HTMLElement): void {
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

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.renderControls();
  }

  private async animateDeliveries(
    deliveries: ReturnType<typeof presentPNCounterDemo>["latestDeliveries"],
    generation: number,
  ): Promise<void> {
    const operations = new Map<number, typeof deliveries>();
    for (const delivery of deliveries) {
      operations.set(delivery.sequenceNumber, [
        ...(operations.get(delivery.sequenceNumber) ?? []),
        delivery,
      ]);
    }
    for (const operationDeliveries of operations.values()) {
      const operation = operationDeliveries[0];
      if (!operation || !isReplicaId(operation.author)) continue;
      const author = operation.author;
      this.querySelector<HTMLElement>('[role="status"]')!.textContent =
        `${pnCounterUserName(author)}'s ${operation.amount > 0 ? "sighting" : "correction"} note is reaching the other hikers.`;
      await Promise.all(operationDeliveries.map((delivery) =>
        this.animateHop(
          this.querySelector<HTMLElement>("[data-sequencer-node]")!,
          this.querySelector<HTMLElement>(`[data-client="${delivery.to}"]`)!,
          `${pnCounterUserName(author)} ${signed(operation.amount)}`,
          "sequenced",
        )));
      if (generation !== this.generation) return;
    }
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
    dot.className = `pn-operation-pulse ${leg}`;
    dot.dataset.leg = leg;
    dot.ariaHidden = "true";
    const dotLabel = node("span", `${label} · ${HOP_LATENCY_MS} ms`);
    dotLabel.className = "pn-operation-label";
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
    this.busy = false;
    for (const animation of this.activeAnimations) animation.cancel();
    this.activeAnimations.clear();
    this.querySelector<HTMLElement>("[data-operation-layer]")!.replaceChildren();
  }

  private renderControls(): void {
    const view = presentPNCounterDemo(this.state);
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-update]")) {
      button.disabled = this.busy;
    }
    this.button("race").disabled = this.busy;
    this.button("deliver").disabled = this.busy || !view.canDeliver;
    this.button("reset").disabled = this.busy;
  }

  private render(): void {
    const view = presentPNCounterDemo(this.state);
    this.dataset.phase = view.phase;
    for (const replica of view.replicas) {
      this.querySelector(`[data-pn-total="${replica.id}"]`)!.textContent =
        String(replica.value);
      this.querySelector(`[data-replica-state="${replica.id}"]`)!.textContent =
        view.canDeliver
          ? "Local view · notes waiting"
          : view.phase === "initial"
            ? "Agreed count received"
            : "All checkpoints agree";
      for (const componentId of pnCounterComponentIds) {
        this.querySelector(
          `[data-pn-component="${replica.id}-positive-${componentId}"]`,
        )!.textContent = String(pnCounterComponentCount(replica.positive, componentId));
      }
      for (const author of ["A", "B", "C"] as const) {
        this.querySelector(
          `[data-pn-component="${replica.id}-negative-${author}"]`,
        )!.textContent = String(pnCounterComponentCount(replica.negative, author));
      }
    }
    const operations = new Map<
      number,
      { author: ReplicaId; amount: number; destinations: ReplicaId[] }
    >();
    for (const delivery of view.deliveries) {
      if (!isReplicaId(delivery.author) || !isReplicaId(delivery.to)) continue;
      const operation = operations.get(delivery.sequenceNumber) ?? {
        author: delivery.author,
        amount: delivery.amount,
        destinations: [],
      };
      operation.destinations.push(delivery.to);
      operations.set(delivery.sequenceNumber, operation);
    }
    const deliveries = this.querySelector<HTMLOListElement>("[data-deliveries]")!;
    deliveries.replaceChildren(...(operations.size
      ? [...operations].reverse().map(([, operation]) =>
        node(
          "li",
          `${pnCounterUserName(operation.author)} ${signed(operation.amount)} reached ${
            operation.destinations.map(pnCounterUserName).join(", ")
          }`,
        ))
      : [node(
        "li",
        view.canDeliver
          ? `${view.queuedOperations} checkpoint ${view.queuedOperations === 1 ? "note" : "notes"} waiting.`
          : "No correction note shared yet.",
      )]));
    this.querySelector<HTMLOutputElement>("[data-sequence-counter]")!.value =
      `${view.sequenceNumber} ${view.sequenceNumber === 1 ? "note" : "notes"}`;
    this.querySelector<HTMLElement>('[role="status"]')!.textContent = view.result;
    this.renderControls();
  }
}

if (!customElements.get("pn-counter-demo")) {
  customElements.define("pn-counter-demo", PNCounterDemoElement);
}
