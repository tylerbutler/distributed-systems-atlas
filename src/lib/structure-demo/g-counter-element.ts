import {
  createGCounterDemo,
  deliverRace,
  presentGCounterDemo,
  resendComponent,
  stageRace,
  type GCounterDemoResult,
  type GCounterDemoState,
} from "./g-counter";

type Action = "stage" | "deliver" | "resend" | "reset";

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

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    this.button("stage").addEventListener("click", () => {
      this.apply(stageRace(this.state), "deliver");
    });
    this.button("deliver").addEventListener("click", () => {
      this.apply(deliverRace(this.state), "resend");
    });
    this.button("resend").addEventListener("click", () => {
      this.apply(resendComponent(this.state), "resend");
    });
    this.button("reset").addEventListener("click", () => {
      this.state = createGCounterDemo();
      this.render();
      this.button("stage").focus();
    });
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  private button(action: Action): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing G-counter ${action} control`);
    return button;
  }

  private apply(result: GCounterDemoResult, focus: Action): void {
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
    this.button(result.ok ? focus : "reset").focus();
  }

  private render(): void {
    const view = presentGCounterDemo(this.state);
    this.dataset.phase = view.phase;
    for (const replica of view.replicas) {
      this.querySelector(`[data-total="${replica.id}"]`)!.textContent = String(replica.value);
      this.querySelector(`[data-replica-state="${replica.id}"]`)!.textContent =
        view.phase === "initial" ? "Connected to Sluice"
          : view.phase === "staged" && replica.id === "A" ? "Local increment +7"
            : view.phase === "staged" && replica.id === "B" ? "Local increment +3"
              : view.phase === "staged" ? "Waiting for delivery"
                : "Synchronized";
      for (const component of replica.counts) {
        this.querySelector(`[data-component="${replica.id}-${component.replicaId}"]`)!.textContent =
          String(component.count);
      }
    }
    this.querySelector("[data-pending]")!.textContent = view.pending ? "Yes" : "No";
    this.querySelector("[data-sequence]")!.textContent = String(view.sequenceNumber);
    const deliveries = this.querySelector<HTMLOListElement>("[data-deliveries]")!;
    deliveries.replaceChildren(...(view.deliveries.length
      ? view.deliveries.map((delivery) =>
        node("li", `op ${delivery.sequenceNumber}: ${delivery.author} to ${delivery.to}`))
      : [node("li", view.pending ? "Two operations wait for delivery." : "No operation delivered yet.")]));
    this.querySelector<HTMLElement>('[role="status"]')!.textContent = view.result;
    this.button("stage").disabled = !view.canStage;
    this.button("deliver").disabled = !view.canDeliver;
    this.button("resend").disabled = !view.canResend;
    this.button("reset").disabled = false;
  }
}

if (!customElements.get("g-counter-demo")) {
  customElements.define("g-counter-demo", GCounterDemoElement);
}
