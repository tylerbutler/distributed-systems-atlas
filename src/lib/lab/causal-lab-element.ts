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
  private selectedMessage?: string;
  private playback?: ReturnType<typeof setInterval>;
  private signal?: Animation;
  private controlNumber = 0;
  private readonly idPrefix = `causal-lab-${++instanceNumber}`;
  private readonly controls = section("Lesson controls");
  private readonly replicas = node("div");
  private readonly comparison = section("Vector comparison");
  private readonly messages = section("Queued messages");
  private readonly trace = section("Trace navigation");
  private readonly inspector = section("State inspector");
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
      this.controls.className = "lab-controls";
      this.comparison.className = "lab-comparison";
      this.messages.className = "lab-messages";
      this.trace.className = "lab-trace";
      this.inspector.className = "lab-inspector";
      this.invariants.className = "lab-invariants";
      this.explanation.className = "lab-explanation";
      this.status.setAttribute("role", "status");
      this.status.setAttribute("aria-live", "polite");
      this.status.setAttribute("aria-atomic", "true");
      this.alert.setAttribute("role", "alert");
      this.alert.hidden = true;
      this.replaceChildren(
        node("h2", "Causal lab"), this.controls, this.replicas, this.messages,
        this.comparison, this.trace, this.inspector, this.invariants, this.status, this.alert,
      );
    }
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.updateMotion();
    this.motion.addEventListener("change", this.updateMotion);
  }

  disconnectedCallback(): void {
    this.pause();
    this.signal?.finish();
    this.motion?.removeEventListener("change", this.updateMotion);
  }

  private readonly updateMotion = (): void => {
    this.dataset.motion = this.motion?.matches ? "reduced" : "full";
    if (this.motion?.matches) {
      this.pause();
      this.signal?.finish();
    }
    if (!this.signal) this.render();
  };

  private pause(): void {
    clearInterval(this.playback);
    this.playback = undefined;
  }

  private navigate(index: number): void {
    this.traceIndex = index;
    this.render();
  }

  private play(): void {
    if (this.motion?.matches) {
      this.navigate(this.traceIndex + 1);
      return;
    }
    this.playback = setInterval(() => {
      const last = this.engine.history().length - 1;
      if (this.traceIndex + 1 >= last) this.pause();
      this.navigate(Math.min(this.traceIndex + 1, last));
    }, 900);
    this.render();
  }

  private button(label: string, key: string, run: () => void, reason = ""): HTMLButtonElement {
    const button = node("button", label);
    button.type = "button";
    button.dataset.control = key;
    button.disabled = Boolean(reason);
    if (reason) button.setAttribute("aria-description", reason);
    button.addEventListener("click", () => {
      this.pause();
      run();
    });
    return button;
  }

  private withReason(button: HTMLButtonElement): HTMLElement {
    const group = node("div");
    group.className = "lab-control";
    group.append(button);
    const reason = button.getAttribute("aria-description");
    if (reason) {
      const text = node("p", reason);
      text.id = `${this.idPrefix}-reason-${++this.controlNumber}`;
      button.setAttribute("aria-describedby", text.id);
      group.append(text);
    }
    if (button.dataset.control === JSON.stringify(this.lastError?.action)) {
      group.append(node("p", `Not completed: ${this.lastError!.message}`));
    }
    return group;
  }

  private actionButton(label: string, action: LabAction, reason = ""): HTMLButtonElement {
    const viewingHistory = this.traceIndex < this.engine.history().length - 1 && action.type !== "reset";
    return this.button(label, JSON.stringify(action), () => this.dispatch(action),
      viewingHistory ? "Return to the latest frame to change state." : reason);
  }

  private dispatch(action: LabAction): void {
    this.pause();
    const focused = document.activeElement;
    const previous = this.engine.history()[this.traceIndex];
    const result = this.engine.dispatch(action);
    if ("message" in result) {
      this.lastError = result;
      this.traceIndex = result.lastFrame.index;
      this.render();
      return;
    }
    this.lastError = undefined;
    const commit = (): void => {
      this.traceIndex = result.index;
      this.render(document.activeElement === document.body ? focused : document.activeElement);
      if (action.type === "reset") {
        this.status.textContent = `Lab reset. Initial replica state restored. ${presentFrame(result).announcement}`;
      }
    };
    this.animateAction(action, previous, commit);
  }

  private animateAction(action: LabAction, previous: TraceFrame, commit: () => void): void {
    if (this.motion?.matches || !["add", "remove", "deliver", "partition"].includes(action.type)) {
      commit();
      return;
    }
    const styles = getComputedStyle(this);
    const time = styles.getPropertyValue("--duration-trace").trim();
    const timing = {
      duration: parseFloat(time) * (time.endsWith("ms") ? 1 : 1000),
      easing: styles.getPropertyValue("--ease-out").trim(),
    };
    if (action.type === "partition") {
      commit();
      for (const path of this.messages.querySelectorAll('.lab-route[data-blocked="true"] > path:first-child')) {
        path.animate([
          { d: 'path("M8 12H150 M150 12H292")' },
          { d: 'path("M8 12H132 M168 12H292")' },
        ], timing);
      }
      return;
    }
    const message = action.type === "deliver"
      ? previous.messages.find((entry) => entry.id === action.message) : undefined;
    const stationId = action.type === "add" || action.type === "remove" ? action.replica : message?.to;
    const station = [...this.replicas.children].find((element) => element.getAttribute("aria-label") === `Replica ${stationId}`);
    const queue = message
      ? [...this.messages.querySelectorAll<HTMLElement>(".lab-message")].find((element) => element.dataset.message === message.id)
      : this.messages;
    if (!station || !queue) {
      commit();
      return;
    }
    const origin = this.getBoundingClientRect();
    const stationBox = station.getBoundingClientRect();
    const queueBox = queue.getBoundingClientRect();
    const stationPoint = { x: stationBox.x - origin.x + 20, y: stationBox.y - origin.y + 24 };
    const queuePoint = { x: queueBox.x - origin.x + queueBox.width / 2, y: queueBox.y - origin.y + 24 };
    const [from, to] = action.type === "deliver" ? [queuePoint, stationPoint] : [stationPoint, queuePoint];
    const mark = node("span");
    mark.className = "lab-signal";
    mark.setAttribute("aria-hidden", "true");
    this.append(mark);
    this.setAttribute("aria-busy", "true");
    const pending = this.controls.querySelector("p")!;
    pending.style.minHeight = `${pending.getBoundingClientRect().height}px`;
    pending.textContent = "Signal in transit. Controls return when the recorded frame is ready.";
    pending.id = `${this.idPrefix}-pending`;
    for (const button of this.querySelectorAll("button")) {
      button.disabled = true;
      button.setAttribute("aria-describedby", pending.id);
    }
    const at = (point: { x: number; y: number }, scale = 1): string =>
      `translate(${point.x}px, ${point.y}px) scale(${scale})`;
    this.signal = mark.animate([
      { transform: at(from, action.type === "add" ? 0.3 : 1), offset: 0 },
      { transform: at(from), offset: action.type === "deliver" ? 0 : 0.3 },
      { transform: at(to), offset: 1 },
    ], timing);
    this.signal.onfinish = () => {
      this.signal = undefined;
      mark.remove();
      this.removeAttribute("aria-busy");
      commit();
    };
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

  private render(focused: Element | null = document.activeElement, openMessage = false): void {
    const history = this.engine.history();
    const frame = history[this.traceIndex];
    const presented = presentFrame(frame);
    const focusKey = focused instanceof HTMLElement && this.contains(focused)
      ? focused.dataset.control : undefined;
    const focusSection = focused instanceof HTMLElement ? focused.closest("section") : null;
    const openInspectors = new Set([...this.inspector.querySelectorAll("details[open]")]
      .map((element) => element.getAttribute("data-inspector")));
    if (openMessage) openInspectors.add("message");
    if (!presented.messages.some((message) => message.id === this.selectedMessage)) this.selectedMessage = undefined;
    this.renderControls(presented);
    this.renderReplicas(presented);
    this.renderMessages(presented);
    this.renderTrace(presented, history);
    this.renderInspector(frame, openInspectors);
    this.comparison.hidden = presented.comparison === null;
    this.comparison.replaceChildren(node("h3", "Vector comparison"));
    if (presented.comparison) {
      const evidence = node("p", presented.comparison.evidence);
      evidence.className = "observation-data";
      this.comparison.append(node("p", presented.comparison.label), evidence);
    }
    this.comparison.append(this.explanation);
    this.invariants.hidden = this.lastError !== undefined;
    if (this.lastError) this.showError(this.lastError);
    else {
      this.alert.hidden = true;
      this.status.textContent = this.traceIndex < history.length - 1
        ? `Viewing frame ${frame.index}: ${presented.announcement}` : presented.announcement;
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
      const replacement = [...this.querySelectorAll<HTMLElement>("[data-control]")]
        .find((element) => element.dataset.control === focusKey && !element.matches(":disabled"));
      const playbackControl = focusKey === "play"
        ? this.trace.querySelector<HTMLButtonElement>('[data-control="pause"]:not(:disabled)') : null;
      const heading = (focusSection ?? this.messages).querySelector("h3");
      if (heading) heading.tabIndex = -1;
      (replacement ?? playbackControl ?? heading)?.focus({ preventScroll: true });
    }
  }

  private renderControls(frame: PresentedFrame): void {
    this.controls.replaceChildren(
      node("h3", "Lesson controls"),
      node("p", "Add or remove beacon, then choose which delta arrives. The stations only learn from messages you deliver."),
    );
    const operations = node("div");
    operations.className = "lab-buttons";
    for (const replica of frame.replicas) {
      for (const type of ["add", "remove"] as const) {
        operations.append(this.withReason(this.actionButton(
          `${type === "add" ? "Add" : "Remove"} beacon at ${replica.id}`,
          { type, replica: replica.id, value: "beacon" },
          type === "remove" && !replica.canRemoveBeacon ? "No beacon is visible at this replica." : "",
        )));
      }
    }
    for (const { left, right, partitioned } of frame.links) {
      operations.append(
        this.withReason(this.actionButton(`Partition ${left} and ${right}`, { type: "partition", left, right },
          partitioned ? "This connection is already partitioned." : "")),
        this.withReason(this.actionButton(`Heal ${left} and ${right}`, { type: "heal", left, right },
          partitioned ? "" : "This connection is already open.")),
      );
    }
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
    for (const link of frame.links) {
      const connection = node("div");
      connection.className = "lab-connection";
      connection.append(node("p", link.partitioned ? "Partition active" : `${link.left} to ${link.right}: connection open`),
        this.route(link.partitioned));
      this.messages.append(connection);
    }
    const list = node("ul");
    list.setAttribute("aria-label", "Messages in flight");
    if (!frame.messages.length) list.append(node("li", "No queued messages"));
    for (const message of frame.messages) {
      const item = node("li");
      item.className = "lab-message";
      item.dataset.message = message.id;
      item.dataset.blocked = String(message.blocked);
      const label = message.routeLabel;
      const reason = node("p", viewingHistory
        ? "Return to the latest frame to change state."
        : message.blocked ? "Blocked by active partition" : "Ready for delivery");
      reason.id = `${this.idPrefix}-${message.id}-delivery`;
      const route = node("p");
      route.className = "lab-message-route";
      const forward = message.from === frame.replicas[0]?.id;
      route.dataset.direction = forward ? "forward" : "reverse";
      route.append(node("span", `From ${message.from}`), node("span", `To ${message.to}`));
      const select = this.button(`Inspect ${message.id}`, `inspect-${message.id}`, () => {
        this.selectedMessage = message.id;
        this.render(document.activeElement, true);
      });
      select.setAttribute("aria-pressed", String(this.selectedMessage === message.id));
      item.append(route, this.route(message.blocked, forward), reason, details([
        ["Message ID", message.id, "data"],
        ["Kind", message.kindLabel, "data"],
        ["Live dots", message.dotsLabel, "data"],
        ["Causal context", message.contextLabel, "data"],
      ]));
      const copies = message.id.split(":").slice(3);
      if (copies.length) item.append(node("p", `Copy · ${copies.join(" / ")}`));
      const deliver = this.actionButton(`Deliver ${label}`, { type: "deliver", message: message.id },
        message.blocked ? "Message crosses an active partition." : "");
      deliver.setAttribute("aria-describedby", reason.id);
      const buttons = node("div");
      buttons.className = "lab-buttons";
      buttons.append(select, this.withReason(deliver),
        this.withReason(this.actionButton(`Duplicate ${label}`, { type: "duplicate", message: message.id })));
      item.append(buttons);
      list.append(item);
    }
    this.messages.append(list);
  }

  private route(blocked: boolean, forward = true): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 300 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("lab-route");
    svg.dataset.blocked = String(blocked);
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", blocked ? "M8 12H132 M168 12H292" : "M8 12H292");
    svg.append(path);
    const arrow = document.createElementNS(svg.namespaceURI, "path");
    arrow.setAttribute("d", forward ? "M284 5L292 12L284 19" : "M16 5L8 12L16 19");
    svg.append(arrow);
    if (blocked) {
      const gap = document.createElementNS(svg.namespaceURI, "path");
      gap.setAttribute("d", "M139 4L145 20M155 4L161 20");
      gap.classList.add("lab-route-break");
      svg.append(gap);
    }
    return svg;
  }

  private renderInspector(frame: TraceFrame, open: Set<string | null>): void {
    this.inspector.replaceChildren(node("h3", "State inspector"),
      node("p", `Recorded state at frame ${frame.index}. Engine-private removal records are not exposed by this trace.`));
    const records: Array<[string, string, unknown]> = frame.replicas.map((replica) =>
      [`replica-${replica.id}`, `Inspect Replica ${replica.id}`, replica]);
    const message = frame.messages.find((entry) => entry.id === this.selectedMessage);
    if (message) records.push(["message", `Selected message ${message.id}`, message]);
    else this.inspector.append(node("p", "Select a queued message to inspect its recorded payload."));
    for (const [id, label, record] of records) {
      const disclosure = node("details");
      disclosure.dataset.inspector = id;
      disclosure.open = open.has(id);
      const summary = node("summary", label);
      summary.dataset.control = `summary-${id}`;
      summary.addEventListener("click", () => {
        this.pause();
        if (!this.signal) this.renderTrace(presentFrame(frame), this.engine.history());
      });
      const raw = node("pre", JSON.stringify(record, null, 2));
      disclosure.append(summary, raw);
      this.inspector.append(disclosure);
    }
  }

  private renderTrace(frame: PresentedFrame, history: readonly TraceFrame[]): void {
    const traceIndex = node("p", `Frame ${frame.index} of ${history.length - 1}`);
    traceIndex.className = "observation-data";
    this.trace.replaceChildren(
      node("h3", "Trace navigation"),
      traceIndex,
    );
    const controls = node("div");
    controls.className = "lab-buttons";
    controls.append(
      this.withReason(this.button("Back", "previous", () => this.navigate(this.traceIndex - 1),
        this.traceIndex === 0 ? "This is the first frame." : "")),
      this.withReason(this.button("Forward", "next", () => this.navigate(this.traceIndex + 1),
        this.traceIndex === history.length - 1 ? "This is the latest frame." : "")),
      this.withReason(this.button(this.motion?.matches ? "Next recorded frame" : "Play", "play", () => this.play(),
        this.traceIndex === history.length - 1 ? "There are no later recorded frames."
          : this.playback ? "Playback is running." : "")),
      this.withReason(this.button("Pause", "pause", () => this.render(),
        this.playback ? "" : "Playback is stopped.")),
      this.actionButton("Reset lab", { type: "reset" }),
    );
    this.trace.append(controls, node("p", this.motion?.matches
      ? "Advance one recorded frame at a time. No actions are generated."
      : "Play visits recorded frames every 900 ms. It never delivers a message or creates an action."));
    if (this.traceIndex < history.length - 1) {
      this.trace.append(node("p", "Viewing recorded state. Return to the latest frame to change state, or reset the lab."));
    }
    const navigation = node("nav");
    navigation.setAttribute("aria-label", "Trace history");
    navigation.append(node("h4", "Recorded frames"));
    const list = node("ol");
    list.start = 0;
    for (const entry of history) {
      const item = node("li");
      const select = this.button(`Frame ${entry.index}: ${entry.actionLabel}`, `frame-${entry.index}`,
        () => this.navigate(entry.index));
      if (entry.index === this.traceIndex) select.setAttribute("aria-current", "step");
      item.append(select, node("p", entry.explanation));
      list.append(item);
    }
    navigation.append(list);
    this.trace.append(navigation);
  }
}

if (!customElements.get("causal-lab")) customElements.define("causal-lab", CausalLabElement);
