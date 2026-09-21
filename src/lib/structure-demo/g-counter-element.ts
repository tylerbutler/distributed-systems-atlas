import {
  createGCounterDemo,
  deliverRace,
  incrementReplica,
  presentGCounterDemo,
  resendComponent,
  stageRace,
  type GCounterDemoResult,
  type GCounterDemoState,
  type ReplicaId,
} from "./g-counter";

type Action = "race" | "resend" | "reset";

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
      await this.applyAnimated(resendComponent(this.state), this.button("resend"));
    });
    this.button("reset").addEventListener("click", () => {
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
    if (this.autoDeliver) {
      await this.deliverQueued(this.button("resend"));
    } else {
      this.button("race").focus();
    }
  }

  private async deliverQueued(focus: HTMLElement): Promise<void> {
    if (this.delivering) return;
    this.delivering = true;
    const activeElement = document.activeElement;
    try {
      while (this.autoDeliver && presentGCounterDemo(this.state).canDeliver) {
        const queuedOperations = presentGCounterDemo(this.state).queuedOperations;
        this.showGuidedObservation(
          `${queuedOperations} ${queuedOperations === 1 ? "operation is" : "operations are"} ready for the sequencer.`,
          [this.querySelector<HTMLElement>("[data-sequencer-node]")!],
          "box",
        );
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          await new Promise((resolve) => setTimeout(resolve, 500 / this.speed));
        }
        const delivered = deliverRace(this.state);
        if (!delivered.ok) {
          this.apply(delivered, focus);
          return;
        }
        this.state = delivered.state;
        const deliveries = presentGCounterDemo(this.state).latestDeliveries;
        this.render();
        await this.animateDeliveries(deliveries);
        this.showGuidedObservation(
          "Each replica keeps the largest report from every client, then adds those counts.",
          [...this.querySelectorAll<HTMLElement>("[data-total]")],
          "circle",
        );
      }
    } finally {
      this.delivering = false;
      this.render();
      if (document.activeElement === activeElement) focus.focus();
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
    await this.animateDeliveries(view.latestDeliveries);
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

  private async animateDeliveries(
    deliveries: ReturnType<typeof presentGCounterDemo>["latestDeliveries"],
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
      await this.animateHop(
        this.querySelector<HTMLElement>(`[data-client="${author}"]`)!,
        this.querySelector<HTMLElement>("[data-sequencer-node]")!,
        sequenceNumber,
      );
      await Promise.all(operationDeliveries.map((delivery) =>
        this.animateHop(
          this.querySelector<HTMLElement>("[data-sequencer-node]")!,
          this.querySelector<HTMLElement>(`[data-client="${delivery.to}"]`)!,
          sequenceNumber,
        )));
    }
  }

  private async animateHop(from: HTMLElement, to: HTMLElement, sequenceNumber: number): Promise<void> {
    const layer = this.querySelector<HTMLElement>("[data-operation-layer]")!;
    const root = layer.getBoundingClientRect();
    const start = from.getBoundingClientRect();
    const end = to.getBoundingClientRect();
    const dot = node("span", String(sequenceNumber));
    dot.className = "operation-pulse";
    dot.ariaHidden = "true";
    layer.append(dot);
    const duration = Math.max(120, 420 / this.speed);
    const animation = dot.animate([
      {
        transform: `translate(${start.left + start.width / 2 - root.left - 10}px, ${start.top + start.height / 2 - root.top - 10}px) scale(.7)`,
        opacity: 0.55,
      },
      {
        transform: `translate(${end.left + end.width / 2 - root.left - 10}px, ${end.top + end.height / 2 - root.top - 10}px) scale(1)`,
        opacity: 1,
      },
    ], {
      duration,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "forwards",
    });
    await animation.finished;
    dot.remove();
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

  private render(): void {
    const view = presentGCounterDemo(this.state);
    this.dataset.phase = view.phase;
    for (const replica of view.replicas) {
      this.querySelector(`[data-total="${replica.id}"]`)!.textContent = String(replica.value);
      this.querySelector(`[data-replica-state="${replica.id}"]`)!.textContent =
        view.pending
          ? replica.value > 0 ? "Local view · delivery pending" : "Waiting for delivery"
          : view.phase === "initial" ? "Connected to sequencer" : "Synchronized";
      for (const component of replica.counts) {
        this.querySelector(`[data-component="${replica.id}-${component.replicaId}"]`)!.textContent =
          String(component.count);
      }
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
      ? [...operations].map(([sequenceNumber, operation]) =>
        node(
          "li",
          `SN ${sequenceNumber} · ${operation.author} report to ${operation.destinations.join(", ")}`,
        ))
      : [node("li", view.pending ? `${view.queuedOperations} queued; no delivery yet.` : "No operation delivered yet.")]));
    const sequenceTrack = this.querySelector<HTMLElement>("[data-sequence-track]")!;
    sequenceTrack.replaceChildren(...(operations.size
      ? [...operations].map(([sequenceNumber, operation]) => {
        const chip = node("span", `SN ${sequenceNumber} · ${operation.author}`);
        chip.className = "sequence-chip";
        return chip;
      })
      : [node("span", view.pending ? "Operations awaiting order" : "No sequence numbers yet")]));
    this.querySelector<HTMLElement>('[role="status"]')!.textContent = view.result;
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-increment]")) {
      button.disabled = false;
    }
    this.button("race").disabled = false;
    this.button("race").textContent = this.autoDeliver
      ? "Run A +7 and B +3 race"
      : "Queue A +7 and B +3 race";
    this.button("resend").disabled = this.delivering || !view.canResend;
    this.button("resend").textContent = view.latestAuthor
      ? `Resend ${view.latestAuthor}'s component`
      : "Resend latest component";
    this.button("reset").disabled = false;
    this.querySelector<HTMLInputElement>("[data-pace]")!.disabled = false;
    this.querySelector<HTMLInputElement>("[data-auto-deliver]")!.disabled = false;
    this.querySelector<HTMLInputElement>("[data-guided-observations]")!.disabled = false;
  }
}

if (!customElements.get("g-counter-demo")) {
  customElements.define("g-counter-demo", GCounterDemoElement);
}
