import { demoTransportDuration } from "./demo-transport";

export const autoDeliveryChangeEvent = "demo-auto-delivery-change";

export class DemoTransportControlsElement extends HTMLElement {
  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";

    const speed = this.speedInput;
    const jitter = this.jitterInput;
    const autoDeliver = this.autoDeliverInput;

    speed.addEventListener("input", () => this.renderSpeed());
    autoDeliver.addEventListener("change", () => {
      this.dispatchEvent(new CustomEvent(autoDeliveryChangeEvent, { bubbles: true }));
    });

    speed.disabled = false;
    jitter.disabled = false;
    autoDeliver.disabled = false;
    this.renderSpeed();
  }

  get autoDeliver(): boolean {
    return this.autoDeliverInput.checked;
  }

  get speed(): number {
    return Number(this.speedInput.value);
  }

  nextDuration(baseLatency: number): number {
    const jitterRange = this.jitterInput.checked
      ? this.jitterRange
      : 0;
    return demoTransportDuration(baseLatency, this.speed, jitterRange);
  }

  private get speedInput(): HTMLInputElement {
    const input = this.querySelector<HTMLInputElement>("[data-transport-speed]");
    if (!input) throw new Error("Missing demo speed control");
    return input;
  }

  private get jitterInput(): HTMLInputElement {
    const input = this.querySelector<HTMLInputElement>("[data-transport-jitter]");
    if (!input) throw new Error("Missing demo jitter control");
    return input;
  }

  private get autoDeliverInput(): HTMLInputElement {
    const input = this.querySelector<HTMLInputElement>("[data-transport-auto-deliver]");
    if (!input) throw new Error("Missing demo auto-delivery control");
    return input;
  }

  private get jitterRange(): number {
    return Number(this.dataset.jitterRange ?? 120);
  }

  private renderSpeed(): void {
    const output = this.querySelector<HTMLOutputElement>(
      "[data-transport-speed-output]",
    );
    if (!output) throw new Error("Missing demo speed output");
    output.value = `${this.speed}×`;
  }
}

if (!customElements.get("demo-transport-controls")) {
  customElements.define("demo-transport-controls", DemoTransportControlsElement);
}
