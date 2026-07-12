// Canvas zoom bounds and pointer hit-testing. Extracted from App.tsx.

export const MIN_CANVAS_ZOOM = 0.5;
export const MAX_CANVAS_ZOOM = 2.5;

export function clampCanvasZoom(value: number): number {
  return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, Number(value.toFixed(2))));
}

export function isCanvasBackgroundTarget(target: EventTarget | null, currentTarget: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest(".canvas-node, .canvas-brand, .run-cta, .flow-actions, .canvas-hint, .edge-hit-area")) {
    return false;
  }

  if (currentTarget instanceof Element && target === currentTarget) {
    return true;
  }

  return target.classList.contains("canvas-viewport") || target.classList.contains("edges");
}
