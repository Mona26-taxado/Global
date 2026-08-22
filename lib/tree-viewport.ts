export const TREE_MIN_SCALE = 0.5;
export const TREE_MAX_SCALE = 2.2;
export const TREE_ZOOM_FACTOR = 1.18;

export function clampTreeScale(scale: number, min = TREE_MIN_SCALE, max = TREE_MAX_SCALE) {
  return Math.min(max, Math.max(min, scale));
}

/** Content point currently under the visible canvas center. */
export function contentPointAtViewportCenter(input: {
  scale: number;
  positionX: number;
  positionY: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const { scale, positionX, positionY, viewportWidth, viewportHeight } = input;
  if (scale === 0) return { x: 0, y: 0 };
  return {
    x: (viewportWidth / 2 - positionX) / scale,
    y: (viewportHeight / 2 - positionY) / scale,
  };
}

/**
 * Keep the same content point under the viewport center after a scale change.
 * screen = content * scale + position
 */
export function zoomAroundViewportCenter(input: {
  scale: number;
  positionX: number;
  positionY: number;
  viewportWidth: number;
  viewportHeight: number;
  nextScale: number;
}) {
  const nextScale = clampTreeScale(input.nextScale);
  const mid = contentPointAtViewportCenter(input);
  return {
    scale: nextScale,
    positionX: input.viewportWidth / 2 - mid.x * nextScale,
    positionY: input.viewportHeight / 2 - mid.y * nextScale,
  };
}

/** Scale and pan so the full tree sits in the visible canvas, centered. */
export function fitTreeToViewport(input: {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
  padding?: number;
}) {
  const pad = input.padding ?? 32;
  const vw = Math.max(1, input.viewportWidth);
  const vh = Math.max(1, input.viewportHeight);
  const cw = Math.max(1, input.contentWidth);
  const ch = Math.max(1, input.contentHeight);
  const scale = clampTreeScale(Math.min((vw - pad * 2) / cw, (vh - pad * 2) / ch));
  const extraY = Math.max(0, vh - ch * scale);
  return {
    scale,
    positionX: (vw - cw * scale) / 2,
    /** Bias the root toward the upper third while keeping the full tree in view. */
    positionY: extraY * 0.28,
  };
}

/** After wrapper resize, keep the same content point at the new viewport center. */
export function retainCenterOnResize(input: {
  scale: number;
  positionX: number;
  positionY: number;
  prevViewportWidth: number;
  prevViewportHeight: number;
  nextViewportWidth: number;
  nextViewportHeight: number;
}) {
  const mid = contentPointAtViewportCenter({
    scale: input.scale,
    positionX: input.positionX,
    positionY: input.positionY,
    viewportWidth: input.prevViewportWidth,
    viewportHeight: input.prevViewportHeight,
  });
  return {
    scale: input.scale,
    positionX: input.nextViewportWidth / 2 - mid.x * input.scale,
    positionY: input.nextViewportHeight / 2 - mid.y * input.scale,
  };
}
