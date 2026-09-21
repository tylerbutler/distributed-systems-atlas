import {
  createGCounterDemo,
  deliverNextOperation,
  incrementReplica,
  presentGCounterDemo,
  resendUserCount,
  stageRace,
  type GCounterDemoResult,
  type GCounterDemoState,
  type ReplicaId,
} from "./g-counter";

type Action = "race" | "resend" | "reset";
const HOP_LATENCY_MS = 1000;
const FIFO_GAP_MS = 25;

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
  private speed = 1;
  private autoDeliver = true;
  private delivering = false;
  private guided = false;
  private guidedTimer: number | undefined;
  private generation = 0;
  private lastOutboundArrival = 0;
  private outboundArrivals: Promise<void>[] = [];
  private activeBroadcasts = new Set<Promise<void>>();
  private activeAnimations = new Set<Animation>();
  private deliveryFocus: HTMLElement | null = null;

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-increment]")) {
      button.addEventListener("click", async () => {
        const replica = button.dataset.replica as ReplicaId;
        const amount = Number(button.dataset.increment);
        const result = incrementReplica(this.state, replica, amount);
        this.apply(result, button);
        if (result.ok) {
          this.queueOutbound(replica, `+${amount}`);
          this.showGuidedObservation(
            `${replica} updates its local count and queues one operation.`,
            [this.querySelector<HTMLElement>(`[data-total="${replica}"]`)!],
            "circle",
          );
          if (this.autoDeliver) await this.deliverQueued(button);
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
      this.resetFlow();
      this.state = createGCounterDemo();
      this.render();
      this.showGuidedObservation(
        "Turn off Auto-deliver to queue several operations before delivery.",
        [],
      );
      this.button("race").focus();
    });
    const pace = this.querySelector<HTMLInputElement>("[data-pace]")!;
    pace.addEventListener("input", () => {
      this.speed = Number(pace.value);
      this.querySelector<HTMLOutputElement>("[data-pace-output]")!.value = `${this.speed}×`;
    });
    const autoDeliver = this.querySelector<HTMLInputElement>("[data-auto-deliver]")!;
    autoDeliver.addEventListener("change", async () => {
      this.autoDeliver = autoDeliver.checked;
      if (this.autoDeliver && presentGCounterDemo(this.state).canDeliver) {
        await this.deliverQueued(autoDeliver);
      }
    });
    const guided = this.querySelector<HTMLInputElement>("[data-guided-observations]")!;
    guided.addEventListener("change", () => {
      this.guided = guided.checked;
      this.querySelector<HTMLElement>("[data-guided-panel]")!.hidden = !this.guided;
      if (this.guided) {
        this.showGuidedObservation(
          "Turn off Auto-deliver to queue several operations before delivery.",
          [],
        );
      } else {
        this.clearGuidedMarks();
      }
    });
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  private button(action: Action): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing G-counter ${action} control`);
    return button;
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
      `${changed.map((replica) => replica.id).join(" and ")} ${
        changed.length === 1 ? "updates its" : "update their"
      } local count before delivery.`,
      changed.map((replica) =>
        this.querySelector<HTMLElement>(`[data-total="${replica.id}"]`)!),
      "circle",
    );
    this.queueOutbound("A", "+7");
    this.queueOutbound("B", "+3");
    if (this.autoDeliver) {
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
      while (this.autoDeliver && presentGCounterDemo(this.state).canDeliver) {
        await (this.outboundArrivals.shift() ?? Promise.resolve());
        if (generation !== this.generation) return;
        const queuedOperations = presentGCounterDemo(this.state).queuedOperations;
        this.showGuidedObservation(
          `${queuedOperations} ${queuedOperations === 1 ? "operation is" : "operations are"} ready for the sequencer.`,
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
      if (this.autoDeliver && presentGCounterDemo(this.state).canDeliver) {
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
        `${author} resend`,
        "outbound",
      );
    }
    const broadcast = this.animateDeliveries(view.latestDeliveries, view);
    this.activeBroadcasts.add(broadcast);
    await broadcast.finally(() => this.activeBroadcasts.delete(broadcast));
    this.apply(result, focus);
    this.showGuidedObservation(
      "Each replica keeps the largest report from every client, then adds those counts.",
      [...this.querySelectorAll<HTMLElement>("[data-total]")],
      "circle",
    );
  }

  private setBusy(busy: boolean): void {
    for (const control of this.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input")) {
      control.disabled = busy;
    }
  }

  private queueOutbound(author: ReplicaId, label: string): void {
    const now = performance.now();
    const duration = this.motionDuration();
    const arrivalAt = Math.max(
      now + duration,
      this.lastOutboundArrival + FIFO_GAP_MS / this.speed,
    );
    this.lastOutboundArrival = arrivalAt;
    this.outboundArrivals.push(this.animateHop(
      this.querySelector<HTMLElement>(`[data-client="${author}"]`)!,
      this.querySelector<HTMLElement>("[data-sequencer-node]")!,
      `${author} ${label}`,
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
          "Each replica keeps the largest report from every client, then adds those counts.",
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
      if (author !== "A" && author !== "B" && author !== "C") continue;
      this.querySelector<HTMLElement>('[role="status"]')!.textContent =
        `The sequencer is delivering operation ${sequenceNumber} from ${author}.`;
      this.showGuidedObservation(
        `The sequencer assigns SN ${sequenceNumber} to ${author}'s report.`,
        [this.querySelector<HTMLElement>("[data-sequencer-node]")!],
        "box",
      );
      await Promise.all(operationDeliveries.map(async (delivery) => {
        await this.animateHop(
          this.querySelector<HTMLElement>("[data-sequencer-node]")!,
          this.querySelector<HTMLElement>(`[data-client="${delivery.to}"]`)!,
          `SN ${sequenceNumber}`,
          "sequenced",
        );
        if (
          generation === this.generation &&
          (delivery.to === "A" || delivery.to === "B" || delivery.to === "C")
        ) {
          this.renderReplica(view, delivery.to);
        }
      }));
    }
  }

  private motionDuration(): number {
    return HOP_LATENCY_MS / this.speed;
  }

  private async animateHop(
    from: HTMLElement,
    to: HTMLElement,
    label: string,
    leg: "outbound" | "sequenced",
    duration = this.motionDuration(),
  ): Promise<void> {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = this.querySelector<HTMLElement>("[data-operation-layer]")!;
    const root = layer.getBoundingClientRect();
    const start = from.getBoundingClientRect();
    const end = to.getBoundingClientRect();
    const dot = node("span", "");
    dot.className = `operation-pulse ${leg}`;
    dot.dataset.leg = leg;
    dot.ariaHidden = "true";
    const dotLabel = node("span", `${label} · ${HOP_LATENCY_MS} ms`);
    dotLabel.className = "operation-pulse-label";
    dot.append(dotLabel);
    layer.append(dot);
    const animation = dot.animate([
      {
        transform: `translate(${start.left + start.width / 2 - root.left - 5}px, ${start.top + start.height / 2 - root.top - 5}px) scale(.7)`,
        opacity: 0.55,
      },
      {
        transform: `translate(${end.left + end.width / 2 - root.left - 5}px, ${end.top + end.height / 2 - root.top - 5}px) scale(1)`,
        opacity: 1,
      },
    ], {
      duration,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "forwards",
    });
    this.activeAnimations.add(animation);
    await animation.finished.catch(() => undefined);
    this.activeAnimations.delete(animation);
    dot.remove();
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
    const className = shape === "circle" ? "guided-circle" : "guided-box";
    for (const element of elements) element.classList.add(className);
    if (elements.length === 0) return;
    this.guidedTimer = window.setTimeout(
      () => this.clearGuidedMarks(),
      Math.max(900, 1400 / this.speed),
    );
  }

  private clearGuidedMarks(): void {
    if (this.guidedTimer !== undefined) window.clearTimeout(this.guidedTimer);
    this.guidedTimer = undefined;
    for (const element of this.querySelectorAll<HTMLElement>(".guided-circle, .guided-box")) {
      element.classList.remove("guided-circle", "guided-box");
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
        ? replica.value > 0 ? "Local view · delivery pending" : "Waiting for delivery"
        : view.phase === "initial" ? "Connected to sequencer" : "Synchronized";
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
    const operations = new Map<number, { author: string; destinations: string[] }>();
    for (const delivery of view.deliveries) {
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
          `SN ${sequenceNumber} · ${operation.author} report to ${operation.destinations.join(", ")}`,
        ))
      : [node("li", view.pending ? `${view.queuedOperations} queued; no delivery yet.` : "No operation delivered yet.")]));
    const sequenceCounter =
      this.querySelector<HTMLOutputElement>("[data-sequence-counter]")!;
    const previousSequence = sequenceCounter.value;
    sequenceCounter.value = `SN ${view.sequenceNumber}`;
    if (previousSequence !== sequenceCounter.value && view.sequenceNumber > 0) {
      sequenceCounter.classList.remove("stamped");
      void sequenceCounter.offsetWidth;
      sequenceCounter.classList.add("stamped");
    }
    this.querySelector<HTMLElement>('[role="status"]')!.textContent = view.result;
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-increment]")) {
      button.disabled = false;
    }
    this.button("race").disabled = false;
    this.button("race").textContent = this.autoDeliver
      ? "Run A +7 and B +3 race"
      : "Queue A +7 and B +3 race";
    this.button("resend").disabled =
      this.delivering || this.activeBroadcasts.size > 0 || !view.canResend;
    this.button("resend").textContent = view.latestAuthor
      ? `Resend ${view.latestAuthor}'s count`
      : "Resend latest user's count";
    this.button("reset").disabled = false;
    this.querySelector<HTMLInputElement>("[data-pace]")!.disabled = false;
    this.querySelector<HTMLInputElement>("[data-auto-deliver]")!.disabled = false;
    this.querySelector<HTMLInputElement>("[data-guided-observations]")!.disabled = false;
  }
}

if (!customElements.get("g-counter-demo")) {
  customElements.define("g-counter-demo", GCounterDemoElement);
}
