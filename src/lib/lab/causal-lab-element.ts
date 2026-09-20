import { createCausalEngine } from "./causal-engine";
import type { Dot, LabAction, LabError, SimulationEngine, TraceFrame, VersionVector } from "./contract";
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

function dotsText(dots: readonly Dot[]): string {
  return dots.map((dot) => `${dot.replica}:${dot.counter}`).join(", ") || "No live dots";
}

function vectorText(vector: VersionVector): string {
  return Object.entries(vector).map(([id, count]) => `${id}:${count}`).join(", ");
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
      this.status.setAttribute("role", "status");
      this.status.setAttribute("aria-live", "polite");
      this.status.setAttribute("aria-atomic", "true");
      this.alert.setAttribute("role", "alert");
      this.alert.hidden = true;
      this.replaceChildren(
        node("h2", "Causal lab"), this.controls, this.status, this.alert, this.trace,
        this.replicas, this.messages, this.explanation, this.invariants, this.ledger,
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
    const replica = action.type === "add"
      ? result.replicas.find((replica) => replica.id === action.replica)
      : undefined;
    this.status.textContent = replica
      ? `${replica.id} created dot ${replica.id}:${replica.clock[replica.id]}. ${result.explanation}`
      : action.type === "reset" ? "Lab reset. Initial replica state restored." : result.explanation;
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
    const focused = document.activeElement;
    const focusKey = focused instanceof HTMLButtonElement && this.contains(focused)
      ? focused.dataset.control : undefined;
    this.renderControls(frame);
    this.renderReplicas(frame);
    this.renderMessages(frame);
    this.renderTrace(frame, history);
    this.invariants.hidden = this.lastError !== undefined;
    if (this.lastError) this.showError(this.lastError);
    else this.alert.hidden = true;
    this.invariants.replaceChildren(node("h3", "Invariant checks"));
    const checks = node("ul");
    const labels: Record<string, string> = {
      uniqueDots: "Unique dots",
      removedDotsStayRemoved: "Removed dots stay removed",
      converged: "Converged",
    };
    for (const [name, valid] of Object.entries(frame.invariants)) {
      checks.append(node("li", `${labels[name] ?? name}: ${valid ? "yes" : "no"}`));
    }
    this.invariants.append(checks);
    this.explanation.replaceChildren(node("p", frame.explanation));
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

  private renderControls(frame: TraceFrame): void {
    this.controls.replaceChildren(node("h3", "Lab controls"));
    const operations = node("div");
    operations.className = "lab-buttons";
    for (const replica of frame.replicas) {
      for (const type of ["add", "remove"] as const) {
        operations.append(this.actionButton(
          `${type === "add" ? "Add" : "Remove"} beacon at ${replica.id}`,
          { type, replica: replica.id, value: "beacon" },
          type === "remove" && !replica.value.includes("beacon") ? "No beacon is visible at this replica." : "",
        ));
      }
    }
    for (let left = 0; left < frame.replicas.length; left++) {
      for (let right = left + 1; right < frame.replicas.length; right++) {
        const a = frame.replicas[left].id;
        const b = frame.replicas[right].id;
        const partitioned = frame.partitions.includes([a, b].sort().join(":"));
        operations.append(
          this.actionButton(`Partition ${a} and ${b}`, { type: "partition", left: a, right: b },
            partitioned ? "This connection is already partitioned." : ""),
          this.actionButton(`Heal ${a} and ${b}`, { type: "heal", left: a, right: b },
            partitioned ? "" : "This connection is already open."),
        );
      }
    }
    operations.append(this.actionButton("Reset lab", { type: "reset" }));
    this.controls.append(operations);
  }

  private renderReplicas(frame: TraceFrame): void {
    this.replicas.replaceChildren(...frame.replicas.map((replica) => {
      const view = section(`Replica ${replica.id}`);
      view.className = "lab-replica";
      view.append(details([
        ["Visible value", replica.value.join(", ") || "Empty set", "data"],
        ["Live dots", dotsText(replica.dots), "data"],
        ["Clock", vectorText(replica.clock), "data"],
        ["Causal context", vectorText(replica.context), "data"],
      ]));
      if (Object.values(replica.context).every((count) => count === 0)) {
        view.append(node("p", "No events observed"));
      }
      return view;
    }));
  }

  private renderMessages(frame: TraceFrame): void {
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
      const partitioned = frame.partitions.includes([message.from, message.to].sort().join(":"));
      item.className = "lab-message";
      item.dataset.blocked = String(partitioned);
      const [number, , , ...copies] = message.id.split(":");
      const label = `${[number, ...copies].join(" ")} from ${message.from} to ${message.to}`;
      const reason = node("p", viewingHistory
        ? "Return to the latest frame to change state."
        : partitioned ? "Blocked by active partition" : "Ready for delivery");
      reason.id = `${this.idPrefix}-${message.id}-delivery`;
      item.append(node("h4", label), reason, details([
        ["Message ID", message.id, "data"],
        ["Kind", message.kind, "data"],
        ["Live dots", dotsText(message.dots), "data"],
        ["Causal context", vectorText(message.context), "data"],
      ]));
      const deliver = this.actionButton(`Deliver ${label}`, { type: "deliver", message: message.id },
        partitioned ? "Message crosses an active partition." : "");
      deliver.setAttribute("aria-describedby", reason.id);
      const buttons = node("div");
      buttons.className = "lab-buttons";
      buttons.append(deliver, this.actionButton(`Duplicate ${label}`, { type: "duplicate", message: message.id }));
      item.append(buttons);
      list.append(item);
    }
    this.messages.append(list);
  }

  private renderTrace(frame: TraceFrame, history: readonly TraceFrame[]): void {
    const navigate = (index: number): void => {
      this.traceIndex = index;
      this.render();
      this.status.textContent = `Viewing frame ${index}: ${history[index].explanation}`;
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
    for (const entry of history) {
      const item = node("li", `${entry.actionLabel}: ${entry.explanation}`);
      if (entry.index === this.traceIndex) item.setAttribute("aria-current", "step");
      list.append(item);
    }
    this.ledger.append(list);
  }
}

if (!customElements.get("causal-lab")) customElements.define("causal-lab", CausalLabElement);
