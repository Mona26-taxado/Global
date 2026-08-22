import { describe, expect, it } from "vitest";
import {
  clampTreeScale,
  contentPointAtViewportCenter,
  fitTreeToViewport,
  retainCenterOnResize,
  zoomAroundViewportCenter,
} from "../lib/tree-viewport";

describe("tree viewport zoom", () => {
  it("keeps the same content point under the canvas center when zooming in and out", () => {
    const start = { scale: 1, positionX: 40, positionY: -20, viewportWidth: 800, viewportHeight: 640 };
    const before = contentPointAtViewportCenter(start);
    const zoomed = zoomAroundViewportCenter({ ...start, nextScale: 1.18 });
    const afterIn = contentPointAtViewportCenter({ ...zoomed, viewportWidth: 800, viewportHeight: 640 });
    expect(afterIn.x).toBeCloseTo(before.x, 8);
    expect(afterIn.y).toBeCloseTo(before.y, 8);

    const out = zoomAroundViewportCenter({
      ...zoomed,
      viewportWidth: 800,
      viewportHeight: 640,
      nextScale: zoomed.scale / 1.18,
    });
    const afterOut = contentPointAtViewportCenter({ ...out, viewportWidth: 800, viewportHeight: 640 });
    expect(afterOut.x).toBeCloseTo(before.x, 8);
    expect(afterOut.y).toBeCloseTo(before.y, 8);
  });

  it("Fit centers content and does not pin it to the left edge", () => {
    const fit = fitTreeToViewport({
      viewportWidth: 1000,
      viewportHeight: 640,
      contentWidth: 400,
      contentHeight: 300,
    });
    expect(fit.positionX).toBeGreaterThan(50);
    expect(fit.positionX).not.toBe(0);
    expect(fit.positionY).toBeGreaterThanOrEqual(0);
    expect(fit.positionX).toBeCloseTo((1000 - 400 * fit.scale) / 2, 6);
    expect(fit.positionY).toBeCloseTo((640 - 300 * fit.scale) * 0.28, 6);
  });

  it("resize keeps the viewed center", () => {
    const start = { scale: 0.8, positionX: -120, positionY: 40 };
    const mid = contentPointAtViewportCenter({ ...start, viewportWidth: 800, viewportHeight: 600 });
    const next = retainCenterOnResize({
      ...start,
      prevViewportWidth: 800,
      prevViewportHeight: 600,
      nextViewportWidth: 1200,
      nextViewportHeight: 700,
    });
    const after = contentPointAtViewportCenter({
      ...next,
      viewportWidth: 1200,
      viewportHeight: 700,
    });
    expect(after.x).toBeCloseTo(mid.x, 8);
    expect(after.y).toBeCloseTo(mid.y, 8);
  });

  it("clamps min/max zoom", () => {
    expect(clampTreeScale(0.01)).toBe(0.5);
    expect(clampTreeScale(9)).toBe(2.2);
  });
});
