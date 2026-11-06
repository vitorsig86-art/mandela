export interface ScreenRect { left: number; top: number; right: number; bottom: number }
export interface ScreenPoint { x: number; y: number }

// Coordinates are CSS pixels in the viewport, shared by clicks and DOM rects.
export function placePopup(point: ScreenPoint, size: { width: number; height: number }, map: ScreenRect, controls: ScreenRect[]) {
  const margin = 12;
  const offset = 24;
  const left = map.left + margin;
  const top = map.top + margin;
  const right = Math.max(left, map.right - margin - size.width);
  const bottom = Math.max(top, map.bottom - margin - size.height);
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const overlaps = (x: number, y: number, rect: ScreenRect) =>
    x < rect.right + margin && x + size.width > rect.left - margin
    && y < rect.bottom + margin && y + size.height > rect.top - margin;
  const candidates: ScreenPoint[] = [
    { x: point.x - size.width / 2, y: point.y + offset },
    { x: point.x + offset, y: point.y + offset },
    { x: point.x - size.width - offset, y: point.y + offset },
    { x: point.x - size.width / 2, y: point.y - size.height - offset },
    { x: point.x - size.width - offset, y: point.y - size.height / 2 },
    { x: point.x + offset, y: point.y - size.height / 2 },
  ];
  // Include control edges so a click beside the toolbar can stay nearby while
  // placing the entire popup below it, rather than over another control.
  const xs = [point.x - size.width / 2, left, right, ...controls.flatMap(rect => [rect.left - size.width - margin, rect.right + margin])];
  const ys = [point.y + offset, point.y - size.height - offset, top, bottom, ...controls.flatMap(rect => [rect.top - size.height - margin, rect.bottom + margin])];
  for (const x of xs) for (const y of ys) candidates.push({ x, y });
  const pointer = { left: point.x - 4, right: point.x + 4, top: point.y - 4, bottom: point.y + 4 };
  const positions = candidates.map(candidate => ({ left: clamp(candidate.x, left, right), top: clamp(candidate.y, top, bottom) }));
  const safe = positions.filter(position => ![...controls, pointer].some(rect => overlaps(position.left, position.top, rect)));
  if (safe.length) {
    // The first three candidates are the preferred below-click placements.
    const preferred = safe.find(position => positions.slice(0, 3).includes(position));
    if (preferred) return preferred;
    return safe.sort((a, b) => {
      const distance = (position: typeof a) => Math.hypot(position.left + size.width / 2 - point.x, position.top + size.height / 2 - point.y);
      return distance(a) - distance(b);
    })[0];
  }
  // Very small viewports may not have a completely free rectangle. Stay inside
  // the map and minimize overlap, rather than letting the popup leave the screen.
  const overlapArea = (position: typeof positions[number]) => controls.reduce((area, rect) => area
    + Math.max(0, Math.min(position.left + size.width, rect.right + margin) - Math.max(position.left, rect.left - margin))
    * Math.max(0, Math.min(position.top + size.height, rect.bottom + margin) - Math.max(position.top, rect.top - margin)), 0);
  return positions.sort((a, b) => overlapArea(a) - overlapArea(b))[0];
}
