/**
 * Adapted from ArtCraft's moodboard viewport geometry at commit
 * 69f53c2f0358a91a5e35e5a7b3a91677320c3112:
 * frontend/libs/components/moodboard/src/lib/canvas/layout/geometry.ts
 * https://github.com/storytold/artcraft/blob/69f53c2f0358a91a5e35e5a7b3a91677320c3112/frontend/libs/components/moodboard/src/lib/canvas/layout/geometry.ts
 *
 * Copyright (c) 2026 ArtCraft Team and the ArtCraft contributors.
 * Used under the MIT option; see ARTCRAFT-LICENSE-MIT.txt and
 * ARTCRAFT-NOTICE.txt in this directory. Changes: selected two pure functions,
 * removed TypeScript types, and formatted them as a small browser ES module.
 */

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;

export const clamp = (value, lower, upper) =>
  Math.max(lower, Math.min(upper, value));

/** Frame stage-coordinate bounds within a pixel canvas, preserving aspect. */
export function fitViewportToBounds(bounds, canvas, padding) {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return {
      zoom: 1,
      pan: {
        x: canvas.width / 2 - bounds.x,
        y: canvas.height / 2 - bounds.y,
      },
    };
  }
  const availableWidth = Math.max(canvas.width - 2 * padding, 1);
  const availableHeight = Math.max(canvas.height - 2 * padding, 1);
  const zoom = clamp(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
    ZOOM_MIN,
    ZOOM_MAX,
  );
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return {
    zoom,
    pan: {
      x: canvas.width / 2 - centerX * zoom,
      y: canvas.height / 2 - centerY * zoom,
    },
  };
}
