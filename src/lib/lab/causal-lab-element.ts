import { createCausalEngine } from "./causal-engine";
import type { LabAction, LabError, SimulationEngine, TraceFrame } from "./contract";
import { presentFrame, type PresentedFrame } from "./present-frame";
import { scenarioById } from "./scenarios";

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

function section(label: string): HTMLElement {
  const element = node("section");
  element.setAttribute("aria-label", label);
  element.append(node("h3", label));
  return element;
}

function details(entries: [string, string, "data" | "prose"][]): HTMLDListElement {
  const list = node("dl");
  for (const [term, value, role] of entries) {
    const description = node("dd", value);
    if (role === "data") description.className = "observation-data";
    list.append(node("dt", term), description);
  }
  return list;
}

let instanceNumber = 0;

class CausalLabElement extends HTMLElement {
  private engine!: SimulationEngine;
  private traceIndex = 0;
  private lastError?: LabError;
  private readonly idPrefix = `causal-lab-${++instanceNumber}`;
  private readonly controls = section("Lab controls");
  private readonly replicas = node("div");
  private readonly comparison = section("Vector comparison");
  private readonly messages = section("Queued messages");
  private readonly trace = section("Trace navigation");
  private readonly ledger = section("Event ledger");
  private readonly invariants = section("Invariant checks");
  private readonly explanation = node("div");
  private readonly status = node("p");
  private readonly alert = node("div");
  private motion?: MediaQueryList;

  connectedCallback(): void {
    if (!this.engine) {
      const scenario = this.getAttribute("scenario");
      try {
        if (!scenario?.trim()) throw new Error("Missing required scenario attribute");
        this.engine = createCausalEngine(scenarioById(scenario));
      } catch (error) {
        this.alert.setAttribute("role", "alert");
        this.alert.textContent = `Could not start lab (${scenario ?? "no scenario"}): ${
          error instanceof Error ? error.message : String(error)
        }. Check the scenario attribute. Static content is unchanged.`;
        this.append(this.alert);
        return;
      }
      this.replicas.className = "lab-replicas";
      this.comparison.className = "lab-comparison";
      this.messages.className = "lab-messages";
      this.invariants.className = "lab-invariants";
      this.explanation.className = "lab-explanation";
      this.status.setAttribute("role", "status");
      this.status.setAttribute("aria-live", "polite");
      this.status.setAttribute("aria-atomic", "true");
      this.alert.setAttribute("role", "alert");
      this.alert.hidden = true;
      this.replaceChildren(
        node("h2", "Causal lab"), this.controls, this.status, this.alert, this.trace,
        this.replicas, this.comparison, this.messages, this.explanation, this.invariants, this.ledger,
      );
      this.render();
    }
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.updateMotion();
    this.motion.addEventListener("change", this.updateMotion);
  }

  disconnectedCallback(): void {
    this.motion?.removeEventListener("change", this.updateMotion);
  }

  private readonly updateMotion = (): void => {
    this.dataset.motion = this.motion?.matches ? "reduced" : "full";
  };

  private button(label: string, key: string, run: () => void, reason = ""): HTMLButtonElement {
    const button = node("button", label);
    button.type = "button";
    button.dataset.control = key;
    button.disabled = Boolean(reason);
    if (reason) button.setAttribute("aria-description", reason);
    button.addEventListener("click", run);
    return button;
  }

  private actionButton(label: string, action: LabAction, reason = ""): HTMLButtonElement {
    const viewingHistory = this.traceIndex < this.engine.history().length - 1 && action.type !== "reset";
    return this.button(label, JSON.stringify(action), () => this.dispatch(action),
      viewingHistory ? "Return to the latest frame to change state." : reason);
  }

  private dispatch(action: LabAction): void {
    const result = this.engine.dispatch(action);
    if ("message" in result) {
      this.lastError = result;
      this.traceIndex = result.lastFrame.index;
      this.render();
      return;
    }
    this.lastError = undefined;
    this.traceIndex = result.index;
    this.render();
    if (action.type === "reset") {
      this.status.textContent = `Lab reset. Initial replica state restored. ${presentFrame(result).announcement}`;
    }
  }

  private showError(error: LabError): void {
    this.alert.replaceChildren(
      node("p", "The action was not completed."),
      details([
        ["Attempted action", JSON.stringify(error.action), "data"],
        ["Engine", error.engine, "data"],
        ["Error", error.message, "prose"],
      ]),
      node("p", `Last valid frame: ${error.lastFrame.index}`),
      node("p", "The last valid state is retained in the trace. Check the connection and try again, or reset the lab."),
    );
    this.alert.hidden = false;
    this.status.textContent = "";
  }

  private render(): void {
    const history = this.engine.history();
    const frame = history[this.traceIndex];
    const presented = presentFrame(frame);
    const focused = document.activeElement;
    const focusKey = focused instanceof HTMLButtonElement && this.contains(focused)
      ? focused.dataset.control : undefined;
    this.renderControls(presented);
    this.renderReplicas(presented);
    this.renderMessages(presented);
    this.renderTrace(presented, history);
    this.comparison.hidden = presented.comparison === null;
    this.comparison.replaceChildren(node("h3", "Vector comparison"));
    if (presented.comparison) {
      const evidence = node("p", presented.comparison.evidence);
      evidence.className = "observation-data";
      this.comparison.append(node("p", presented.comparison.label), evidence);
    }
    this.invariants.hidden = this.lastError !== undefined;
    if (this.lastError) this.showError(this.lastError);
    else {
      this.alert.hidden = true;
      this.status.textContent = presented.announcement;
    }
    this.invariants.replaceChildren(node("h3", "Invariant checks"));
    const checks = node("ul");
    for (const check of presented.invariants) {
      checks.append(node("li", `${check.label}: ${check.passed ? "yes" : "no"}`));
    }
    this.invariants.append(checks);
    this.explanation.replaceChildren(node("p", presented.explanation));
    // This lesson is earned by a completed merge, not merely by healing a link.
    const observedRemove = history.slice(1, this.traceIndex + 1).some((entry, index) =>
      entry.actionLabel === "remove beacon at A"
      && entry.replicas.find((replica) => replica.id === "A")?.context.B === 0
      && history[index].replicas.find((replica) => replica.id === "A")?.dots
        .some((dot) => dot.replica === "A" && dot.counter === 1),
    );
    // Retaining A:1 when B:1 was added proves B had not observed its removal.
    const unobservedRemovalAtAdd = history.slice(1, this.traceIndex + 1).some((entry) =>
      entry.actionLabel === "add beacon at B"
      && entry.replicas.some((replica) => replica.id === "B" && replica.clock.B === 1
        && replica.dots.some((dot) => dot.replica === "A" && dot.counter === 1)),
    );
    if (observedRemove && unobservedRemovalAtAdd && frame.invariants.converged && frame.replicas.every((replica) =>
      replica.value.includes("beacon") && replica.dots.length === 1
      && replica.dots[0].replica === "B" && replica.dots[0].counter === 1,
    )) {
      this.explanation.append(
        node("h3", "The new B dot survives"),
        node("p", "Both replicas retain B:1. A removed the dot it had observed, not B's concurrent add."),
      );
    }
    if (focusKey) {
      const replacement = [...this.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.dataset.control === focusKey && !button.disabled);
      (replacement ?? this.messages.querySelector("h3"))?.focus();
    }
  }

  private renderControls(frame: PresentedFrame): void {
    this.controls.replaceChildren(node("h3", "Lab controls"));
    const operations = node("div");
    operations.className = "lab-buttons";
    for (const replica of frame.replicas) {
      for (const type of ["add", "remove"] as const) {
        operations.append(this.actionButton(
          `${type === "add" ? "Add" : "Remove"} beacon at ${replica.id}`,
          { type, replica: replica.id, value: "beacon" },
          type === "remove" && !replica.canRemoveBeacon ? "No beacon is visible at this replica." : "",
        ));
      }
    }
    for (const { left, right, partitioned } of frame.links) {
      operations.append(
        this.actionButton(`Partition ${left} and ${right}`, { type: "partition", left, right },
          partitioned ? "This connection is already partitioned." : ""),
        this.actionButton(`Heal ${left} and ${right}`, { type: "heal", left, right },
          partitioned ? "" : "This connection is already open."),
      );
    }
    operations.append(this.actionButton("Reset lab", { type: "reset" }));
    this.controls.append(operations);
  }

  private renderReplicas(frame: PresentedFrame): void {
    this.replicas.replaceChildren(...frame.replicas.map((replica) => {
      const view = section(`Replica ${replica.id}`);
      view.className = "lab-replica";
      view.dataset.stationShape = replica.stationShape;
      view.append(details([
        ["Visible value", replica.valueLabel, "data"],
        ["Live dots", replica.dotsLabel, "data"],
        ["Clock", replica.clockLabel, "data"],
        ["Causal context", replica.contextLabel, "data"],
      ]));
      if (!replica.hasObservedEvents) {
        view.append(node("p", "No events observed"));
      }
      return view;
    }));
  }

  private renderMessages(frame: PresentedFrame): void {
    const viewingHistory = this.traceIndex < this.engine.history().length - 1;
    const heading = node("h3", "Queued messages");
    heading.tabIndex = -1;
    this.messages.replaceChildren(heading);
    if (!frame.messages.length) {
      this.messages.append(node("p", "No queued messages"));
      return;
    }
    const list = node("ul");
    for (const message of frame.messages) {
      const item = node("li");
      item.className = "lab-message";
      item.dataset.blocked = String(message.blocked);
      const label = message.routeLabel;
      const reason = node("p", viewingHistory
        ? "Return to the latest frame to change state."
        : message.blocked ? "Blocked by active partition" : "Ready for delivery");
      reason.id = `${this.idPrefix}-${message.id}-delivery`;
      item.append(node("h4", label), reason, details([
        ["Message ID", message.id, "data"],
        ["Kind", message.kindLabel, "data"],
        ["Live dots", message.dotsLabel, "data"],
        ["Causal context", message.contextLabel, "data"],
      ]));
      const deliver = this.actionButton(`Deliver ${label}`, { type: "deliver", message: message.id },
        message.blocked ? "Message crosses an active partition." : "");
      deliver.setAttribute("aria-describedby", reason.id);
      const buttons = node("div");
      buttons.className = "lab-buttons";
      buttons.append(deliver, this.actionButton(`Duplicate ${label}`, { type: "duplicate", message: message.id }));
      item.append(buttons);
      list.append(item);
    }
    this.messages.append(list);
  }

  private renderTrace(frame: PresentedFrame, history: readonly TraceFrame[]): void {
    const navigate = (index: number): void => {
      this.traceIndex = index;
      this.render();
      if (!this.lastError) {
        this.status.textContent = `Viewing frame ${index}: ${presentFrame(history[index]).announcement}`;
      }
    };
    const traceIndex = node("p", `Frame ${frame.index} of ${history.length - 1}`);
    traceIndex.className = "observation-data";
    this.trace.replaceChildren(
      node("h3", "Trace navigation"),
      traceIndex,
      this.button("Previous frame", "previous", () => navigate(this.traceIndex - 1),
        this.traceIndex === 0 ? "This is the first frame." : ""),
      this.button("Next frame", "next", () => navigate(this.traceIndex + 1),
        this.traceIndex === history.length - 1 ? "This is the latest frame." : ""),
    );
    if (this.traceIndex < history.length - 1) {
      this.trace.append(node("p", "Viewing recorded state. Return to the latest frame to change state, or reset the lab."));
    }
    this.ledger.replaceChildren(node("h3", "Event ledger"));
    const list = node("ol");
    list.start = 0;
    for (const entry of history.map(presentFrame)) {
      const item = node("li", `${entry.actionLabel}: ${entry.explanation}`);
      if (entry.index === this.traceIndex) item.setAttribute("aria-current", "step");
      list.append(item);
    }
    this.ledger.append(list);
  }
}

if (!customElements.get("causal-lab")) customElements.define("causal-lab", CausalLabElement);
