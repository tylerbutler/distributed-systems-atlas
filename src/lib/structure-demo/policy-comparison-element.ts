import { policyExamples, policyFrame, policyKind, type PolicyFrame } from "./policy-comparisons";
import { REPLICA_IDS } from "./replicas";

class PolicyComparisonElement extends HTMLElement {
  private step = 0;

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.advance.addEventListener("click", () => this.show(this.step + 1));
    this.required<HTMLButtonElement>("[data-policy-reset]").addEventListener("click", () => {
      if (this.show(0)) this.advance.focus();
    });
    this.required("[data-policy-enhancement]").hidden = true;
    this.required<HTMLButtonElement>("[data-policy-reset]").disabled = false;
    this.advance.disabled = false;
    this.dataset.ready = "true";
  }

  private required<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.querySelector<T>(selector);
    if (!element) throw new Error(`Missing policy comparison element: ${selector}`);
    return element;
  }

  private get advance(): HTMLButtonElement {
    return this.required<HTMLButtonElement>("[data-policy-advance]");
  }

  private render(frame: PolicyFrame): void {
    for (const [index, id] of REPLICA_IDS.entries()) {
      this.required(`[data-policy-left="${id}"]`).textContent = frame.left[index]?.join(" | ") || "empty";
      this.required(`[data-policy-right="${id}"]`).textContent = frame.right[index]?.join(" | ") || "empty";
    }
    this.required("[data-policy-left-evidence]").textContent = frame.leftEvidence;
    this.required("[data-policy-right-evidence]").textContent = frame.rightEvidence;
  }

  private show(step: number): boolean {
    const error = this.required("[data-policy-error]");
    try {
      const kind = policyKind(this.dataset.kind);
      const frame = policyFrame(kind, step);
      const example = policyExamples[kind];
      this.render(frame);
      this.step = step;
      this.dataset.phase = String(step);
      this.advance.textContent = example.actions[step] ?? "Comparison complete";
      this.advance.disabled = step === example.actions.length;
      if (this.advance.disabled && document.activeElement === this.advance) {
        this.required<HTMLButtonElement>("[data-policy-reset]").focus();
      }
      this.required("[data-policy-status]").textContent = step === 0
        ? "Ready: both paths have the same starting input."
        : `Step ${step}. ${step >= 2 ? example.lesson : "Inspect the notebook values before the next step."}`;
      error.hidden = true;
      return true;
    } catch (cause) {
      error.textContent = `Comparison did not advance: ${cause instanceof Error ? cause.message : String(cause)}. The last valid state is unchanged. Reset the comparison to try again.`;
      error.hidden = false;
      return false;
    }
  }
}

if (!customElements.get("policy-comparison")) {
  customElements.define("policy-comparison", PolicyComparisonElement);
}
