import {
  createSetDemo,
  deliverSetDemoOperations,
  presentSetDemo,
  setDemoUserName,
  stageSetDemoRace,
  updateSetReplica,
  type ReplicaId,
  type SetDemoKind,
  type SetDemoOperation,
  type SetDemoResult,
  type SetDemoState,
} from "./set-demo";
import {
  autoDeliveryChangeEvent,
  DemoTransportControlsElement,
} from "./demo-transport-controls";

const HOP_LATENCY_MS = 800;

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

function operationLabel(operation: SetDemoOperation): string {
  if (operation.action === "add") {
    return `+ ${operation.element}${operation.tag ? ` · ${operation.tag}` : ""}`;
  }
  return `- ${operation.element}${
    operation.observedTags?.length
      ? ` · ${operation.observedTags.join(", ")}`
      : ""
  }`;
}

function noteLabel(operation: SetDemoOperation): string {
  if (operation.action === "add") {
    return `Additions page: ${operation.element}${
      operation.tag ? ` as ${operation.tag}` : ""
    }`;
  }
  return `${operation.observedTags ? "Removal note" : "Removals page"}: ${operation.element}${
    operation.observedTags?.length
      ? ` (${operation.observedTags.join(", ")})`
      : ""
  }`;
}

class SetStructureDemoElement extends HTMLElement {
  private state!: SetDemoState;
  private delivering = false;
  private generation = 0;
  private outboundArrivals: Promise<void>[] = [];
  private activeAnimations = new Set<Animation>();

  connectedCallback(): void {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    this.state = createSetDemo(this.kind);
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-set-action]")) {
      button.addEventListener("click", () => {
        const operation: SetDemoOperation = {
          author: button.dataset.replica as ReplicaId,
          action: button.dataset.setAction as "add" | "remove",
          element: button.dataset.element ?? "",
        };
        const result = updateSetReplica(this.state, operation);
        this.apply(result, button);
        if (!result.ok) return;
        this.queueOutbound(result.state.queuedOperations.at(-1)!);
        if (this.transport.autoDeliver) void this.deliverQueued(button);
      });
    }
    this.button("race").addEventListener("click", () => void this.runRace());
    this.button("reset").addEventListener("click", () => {
      this.resetFlow();
      this.state = createSetDemo(this.kind);
      this.render();
      this.button("race").focus();
    });
    this.transport.addEventListener(autoDeliveryChangeEvent, () => {
      if (
        this.transport.autoDeliver &&
        presentSetDemo(this.state).canDeliver
      ) {
        void this.deliverQueued(this.transport);
      }
    });
    this.querySelector<HTMLElement>("[data-enhancement-note]")!.hidden = true;
    this.render();
  }

  private get kind(): SetDemoKind {
    const kind = this.dataset.kind;
    if (kind === "g-set" || kind === "two-p-set" || kind === "or-set") return kind;
    throw new Error("Missing set demo kind");
  }

  private button(action: "race" | "reset"): HTMLButtonElement {
    const button = this.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) throw new Error(`Missing set demo ${action} control`);
    return button;
  }

  private get transport(): DemoTransportControlsElement {
    const controls = this.querySelector<DemoTransportControlsElement>(
      "demo-transport-controls",
    );
    if (!controls) throw new Error("Missing set transport controls");
    return controls;
  }

  private async runRace(): Promise<void> {
    this.resetFlow();
    this.state = createSetDemo(this.kind);
    const staged = stageSetDemoRace(this.state);
    this.apply(staged, this.button("race"));
    if (!staged.ok) return;
    for (const operation of this.state.queuedOperations) {
      this.queueOutbound(operation);
    }
    if (this.transport.autoDeliver) {
      await this.deliverQueued(this.button("race"));
    }
  }

  private async deliverQueued(focus: HTMLElement): Promise<void> {
    if (this.delivering) return;
    this.delivering = true;
    this.renderControls();
    const generation = this.generation;
    try {
      while (
        this.transport.autoDeliver &&
        presentSetDemo(this.state).canDeliver
      ) {
        await Promise.all(this.outboundArrivals.splice(0));
        if (generation !== this.generation) return;
        const result = deliverSetDemoOperations(this.state);
        if (!result.ok) {
          this.apply(result, focus);
          return;
        }
        this.state = result.state;
        this.render(false);
        await this.animateDeliveries(this.state.latestDeliveries, generation);
        if (generation !== this.generation) return;
        this.render(true);
      }
    } finally {
      if (generation !== this.generation) return;
      this.delivering = false;
      this.renderControls();
      if (
        this.transport.autoDeliver &&
        presentSetDemo(this.state).canDeliver
      ) {
        void this.deliverQueued(focus);
      }
    }
  }

  private apply(result: SetDemoResult, focus: HTMLElement): void {
    const alert = this.querySelector<HTMLElement>('[role="alert"]')!;
    if (result.ok) {
      this.state = result.state;
      alert.hidden = true;
      alert.textContent = "";
    } else {
      alert.hidden = false;
      alert.textContent = result.error;
    }
    this.render(!this.delivering);
    (result.ok ? focus : this.button("reset")).focus();
  }

  private queueOutbound(operation: SetDemoOperation): void {
    this.outboundArrivals.push(this.animateHop(
      this.querySelector<HTMLElement>(`[data-client="${operation.author}"]`)!,
      this.querySelector<HTMLElement>("[data-relay-node]")!,
      operationLabel(operation),
      "outbound",
    ));
  }

  private async animateDeliveries(
    deliveries: ReturnType<typeof presentSetDemo>["latestDeliveries"],
    generation: number,
  ): Promise<void> {
    const operations = new Map<number, typeof deliveries>();
    for (const delivery of deliveries) {
      operations.set(delivery.sequenceNumber, [
        ...(operations.get(delivery.sequenceNumber) ?? []),
        delivery,
      ]);
    }
    await Promise.all([...operations.values()].flatMap((copies) => {
      const operation = copies[0];
      if (!operation) return [];
      return copies.map((delivery) =>
        this.animateHop(
          this.querySelector<HTMLElement>("[data-relay-node]")!,
          this.querySelector<HTMLElement>(`[data-client="${delivery.to}"]`)!,
          operationLabel(operation),
          "shared",
        ));
    }));
    if (generation !== this.generation) return;
  }

  private async animateHop(
    from: HTMLElement,
    to: HTMLElement,
    label: string,
    leg: "outbound" | "shared",
  ): Promise<void> {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = this.querySelector<HTMLElement>("[data-operation-layer]")!;
    const root = layer.getBoundingClientRect();
    const start = from.getBoundingClientRect();
    const end = to.getBoundingClientRect();
    const dot = node("span", "");
    dot.className = `set-operation-pulse ${leg}`;
    dot.ariaHidden = "true";
    const dotLabel = node("span", label);
    dotLabel.className = "set-operation-label";
    dot.append(dotLabel);
    layer.append(dot);
    const animation = dot.animate([
      {
        transform: `translate(${start.left + start.width / 2 - root.left - 5}px, ${start.top + start.height / 2 - root.top - 5}px)`,
        opacity: 0.25,
      },
      {
        transform: `translate(${end.left + end.width / 2 - root.left - 5}px, ${end.top + end.height / 2 - root.top - 5}px)`,
        opacity: 1,
      },
    ], {
      duration: this.transport.nextDuration(HOP_LATENCY_MS),
      easing: "ease-in-out",
    });
    this.activeAnimations.add(animation);
    await animation.finished.catch(() => undefined);
    this.activeAnimations.delete(animation);
    dot.remove();
  }

  private resetFlow(): void {
    this.generation += 1;
    this.delivering = false;
    this.outboundArrivals = [];
    for (const animation of this.activeAnimations) animation.cancel();
    this.activeAnimations.clear();
    this.querySelector<HTMLElement>("[data-operation-layer]")!.replaceChildren();
  }

  private renderControls(): void {
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-set-action]")) {
      button.disabled = false;
    }
    this.button("race").disabled = this.delivering;
    this.button("reset").disabled = false;
  }

  private renderReplica(
    view: ReturnType<typeof presentSetDemo>,
    replicaId: ReplicaId,
  ): void {
    const replica = view.replicas.find(({ id }) => id === replicaId);
    if (!replica) return;
    const list = this.querySelector<HTMLElement>(`[data-member-list="${replica.id}"]`)!;
    const notebook = view.orSetNotebooks?.[replica.id];
    list.replaceChildren(...(replica.values.length
      ? replica.values.map((value) => {
        const member = node("span", value);
        for (const { tag } of notebook?.additions.filter(
          ({ element }) => element === value,
        ) ?? []) {
          member.append(node("sup", tag));
        }
        return member;
      })
      : [node("em", "Empty set")]));
    if (notebook) {
      const additions = this.querySelector<HTMLElement>(
        `[data-additions-page="${replica.id}"]`,
      )!;
      additions.replaceChildren(...(notebook.additions.length
        ? notebook.additions.map(({ element, tag }) => node("span", `${element}: ${tag}`))
        : [node("em", "Empty")]));
      this.querySelector<HTMLElement>(
        `[data-highest-tag="${replica.id}"]`,
      )!.textContent = String(notebook.highestTagNumber);
    }
    const latestNote = [...view.deliveries, ...this.state.queuedOperations]
      .filter(({ author }) => author === replica.id)
      .at(-1);
    const note = this.querySelector<HTMLElement>(
      `[data-paper-note-text="${replica.id}"]`,
    )!;
    note.textContent = latestNote
      ? noteLabel(latestNote)
      : note.dataset.initialNote ?? "";
    this.querySelector<HTMLElement>(`[data-replica-state="${replica.id}"]`)!.textContent =
      view.canDeliver
        ? "Local view · record in transit"
        : view.phase === "initial"
          ? this.kind === "g-set" ? "No reports yet" : "Eagle Creek is active"
          : "Matches the other notebooks";
  }

  private render(renderReplicas = true): void {
    const view = presentSetDemo(this.state);
    this.dataset.phase = view.phase;
    if (renderReplicas) {
      for (const replica of view.replicas) this.renderReplica(view, replica.id);
    }

    const grouped = new Map<number, typeof view.deliveries>();
    for (const delivery of view.deliveries) {
      grouped.set(delivery.sequenceNumber, [
        ...(grouped.get(delivery.sequenceNumber) ?? []),
        delivery,
      ]);
    }
    const log = this.querySelector<HTMLOListElement>("[data-deliveries]")!;
    log.replaceChildren(...(grouped.size
      ? [...grouped].reverse().map(([, copies]) => {
        const operation = copies[0]!;
        const recipients = copies
          .map(({ to }) => isReplicaId(to) ? setDemoUserName(to) : to)
          .join(", ");
        return node(
          "li",
          `${setDemoUserName(operation.author)} ${
            operation.action === "add" ? "reported" : "retired"
          } ${operation.element}${
            operation.tag ? ` as ${operation.tag}` : operation.observedTags?.length
              ? ` by dot ${operation.observedTags.join(", ")}`
              : ""
          }; delivered to ${recipients}`,
        );
      })
      : [node("li", view.canDeliver
        ? `${view.queuedOperations} ${view.queuedOperations === 1 ? "record is" : "records are"} in transit.`
        : "No records shared yet.")]));

    const evidence = this.querySelector<HTMLElement>("[data-evidence]")!;
    if (this.kind === "g-set") {
      evidence.textContent = "Entries only accumulate; repeated reports do not create duplicates.";
    } else if (this.kind === "two-p-set") {
      const retired = [...view.deliveries, ...view.latestDeliveries]
        .some(({ action }) => action === "remove");
      evidence.textContent = retired
        ? "Eagle Creek has a permanent removal tombstone."
        : "No retirement tombstone yet.";
    } else {
      const notebook = view.orSetNotebooks?.A;
      const liveTags = notebook?.additions.map(({ tag }) => tag) ?? [];
      const removedTags = notebook?.removals.map(({ tag }) => tag) ?? [];
      evidence.textContent = removedTags.includes("A:1") && liveTags.includes("B:2")
        ? "A:1 is removed. B:2 is live."
        : view.phase === "initial"
          ? "A:1 is the live old installation."
          : `Live dots: ${liveTags.join(", ") || "none"}. Removed dots: ${
            removedTags.join(", ") || "none"
          }.`;
    }

    const operationCount = new Set(view.deliveries.map(({ sequenceNumber }) => sequenceNumber)).size;
    this.querySelector<HTMLOutputElement>("[data-message-count]")!.value =
      `${operationCount} ${operationCount === 1 ? "record" : "records"} shared`;
    this.querySelector<HTMLElement>('[role="status"]')!.textContent = view.result;
    this.renderControls();
  }
}

if (!customElements.get("set-structure-demo")) {
  customElements.define("set-structure-demo", SetStructureDemoElement);
}
