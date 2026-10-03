import type { RoomReplica } from "../../../worker/protocol";

export function renderLiveRoom(
  root: HTMLElement,
  connected: boolean,
  replica: RoomReplica | null,
  connectedReplicas: readonly RoomReplica[] | undefined,
): void {
  root.dataset.roomRole = connected ? replica ?? "observer" : "unassigned";
  root.dataset.roomConnected = String(connected);
  root.querySelector<HTMLElement>("[data-room-title]")!.textContent =
    connected ? "Room connection" : "Create or join a room";
  for (const notebook of root.querySelectorAll<HTMLElement>("[data-client]")) {
    const own = connected && notebook.dataset.client === replica;
    notebook.dataset.yourReplica = String(own);
    notebook.querySelector<HTMLElement>("[data-replica-ownership]")!.textContent =
      own ? "Your notebook" : "Local copy in this browser";
  }
  for (const presence of root.querySelectorAll<HTMLElement>("[data-room-presence]")) {
    const id = presence.dataset.roomPresence;
    presence.textContent = !connected
      ? "Join to check"
      : connectedReplicas === undefined
        ? "Presence unavailable"
        : connectedReplicas.some((replica) => replica === id)
          ? id === replica ? "You are connected" : "Connected"
          : "Available";
  }
  const link = root.querySelector<HTMLAnchorElement>("[data-room-link]")!;
  link.hidden = !connected;
  if (connected) link.href = location.href;
}
