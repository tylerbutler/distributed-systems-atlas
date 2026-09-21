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

type Action = "play" | "resend" | "reset";

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

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-increment]")) {
      button.addEventListener("click", async () => {
        const replica = button.dataset.replica as ReplicaId;
        const amount = Number(button.dataset.increment);
        await this.stageAndDeliver(incrementReplica(this.state, replica, amount), button);
      });
    }
    this.button("play").addEventListener("click", async () => {
      await this.playRace();
    });
    this.button("resend").addEventListener("click", async () => {
      await this.applyAnimated(resendComponent(this.state), this.button("resend"));
    });
    this.button("reset").addEventListener("click", () => {
      this.state = createGCounterDemo();
      this.render();
      this.button("play").focus();
    });
    const pace = this.querySelector<HTMLInputElement>("[data-pace]")!;
    pace.addEventListener("input", () => {
      this.speed = Number(pace.value);
      this.querySelector<HTMLOutputElement>("[data-pace-output]")!.value = `${this.speed}×`;
    });
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  private button(action: Action): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing G-counter ${action} control`);
    return button;
  }

  private async playRace(): Promise<void> {
    this.state = createGCounterDemo();
    const staged = stageRace(this.state);
    if (!staged.ok) {
      this.apply(staged, this.button("play"));
      return;
    }
    await this.stageAndDeliver(staged, this.button("resend"));
  }

  private async stageAndDeliver(
    staged: GCounterDemoResult,
    focus: HTMLElement,
  ): Promise<void> {
    if (!staged.ok) {
      this.apply(staged, focus);
      return;
    }
    this.state = staged.state;
    this.render();
    this.setBusy(true);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      await new Promise((resolve) => setTimeout(resolve, 500 / this.speed));
    }
    await this.applyAnimated(deliverRace(this.state), focus);
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
        `Delivering operation ${sequenceNumber} from ${author} through Sluice.`;
      await this.animateHop(
        this.querySelector<HTMLElement>(`[data-client="${author}"]`)!,
        this.querySelector<HTMLElement>("[data-sluice-node]")!,
        sequenceNumber,
      );
      await Promise.all(operationDeliveries.map((delivery) =>
        this.animateHop(
          this.querySelector<HTMLElement>("[data-sluice-node]")!,
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

  private render(): void {
    const view = presentGCounterDemo(this.state);
    this.dataset.phase = view.phase;
    for (const replica of view.replicas) {
      this.querySelector(`[data-total="${replica.id}"]`)!.textContent = String(replica.value);
      this.querySelector(`[data-replica-state="${replica.id}"]`)!.textContent =
        view.pending
          ? replica.value > 0 ? "Local view · delivery pending" : "Waiting for delivery"
          : view.phase === "initial" ? "Connected to Sluice" : "Synchronized";
      for (const component of replica.counts) {
        this.querySelector(`[data-component="${replica.id}-${component.replicaId}"]`)!.textContent =
          String(component.count);
      }
    }
    this.querySelector("[data-pending]")!.textContent = String(view.queuedOperations);
    this.querySelector("[data-sequence]")!.textContent = String(view.sequenceNumber);
    const deliveries = this.querySelector<HTMLOListElement>("[data-deliveries]")!;
    deliveries.replaceChildren(...(view.deliveries.length
      ? [...view.deliveries].reverse().map((delivery) =>
        node("li", `op ${delivery.sequenceNumber}: ${delivery.author} to ${delivery.to}`))
      : [node("li", view.pending ? `${view.queuedOperations} queued; no delivery yet.` : "No operation delivered yet.")]));
    this.querySelector<HTMLElement>('[role="status"]')!.textContent = view.result;
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-increment]")) {
      button.disabled = false;
    }
    this.button("play").disabled = false;
    this.button("resend").disabled = !view.canResend;
    this.button("resend").textContent = view.latestAuthor
      ? `Resend ${view.latestAuthor}'s component`
      : "Resend latest component";
    this.button("reset").disabled = false;
    this.querySelector<HTMLInputElement>("[data-pace]")!.disabled = false;
  }
}

if (!customElements.get("g-counter-demo")) {
  customElements.define("g-counter-demo", GCounterDemoElement);
}
