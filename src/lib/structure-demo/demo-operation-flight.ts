type DemoOperationFlightOptions = {
  activeAnimations: Set<Animation>;
  className: string;
  duration: number;
  easing?: string;
  from: HTMLElement;
  label: string;
  labelClassName: string;
  layer: HTMLElement;
  leg: string;
  startOpacity?: number;
  to: HTMLElement;
};

export async function animateDemoOperation({
  activeAnimations,
  className,
  duration,
  easing = "ease-in-out",
  from,
  label,
  labelClassName,
  layer,
  leg,
  startOpacity = 0.25,
  to,
}: DemoOperationFlightOptions): Promise<void> {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = layer.getBoundingClientRect();
  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  const dot = document.createElement("span");
  dot.className = `${className} ${leg}`;
  dot.dataset.leg = leg;
  dot.ariaHidden = "true";
  const dotLabel = document.createElement("span");
  dotLabel.className = labelClassName;
  dotLabel.textContent = label;
  dot.append(dotLabel);
  layer.append(dot);
  const animation = dot.animate([
    {
      transform: `translate(${start.left + start.width / 2 - root.left - 5}px, ${start.top + start.height / 2 - root.top - 5}px)`,
      opacity: startOpacity,
    },
    {
      transform: `translate(${end.left + end.width / 2 - root.left - 5}px, ${end.top + end.height / 2 - root.top - 5}px)`,
      opacity: 1,
    },
  ], {
    duration: Math.max(1, duration),
    easing,
  });
  activeAnimations.add(animation);
  try {
    await animation.finished;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  } finally {
    activeAnimations.delete(animation);
    dot.remove();
  }
}
