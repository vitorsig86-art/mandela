import { ArcType, Cartesian2, Color, CustomDataSource, ConstantProperty, JulianDate, Matrix4, SceneTransforms, LabelStyle, PolygonHierarchy, PolylineOutlineMaterialProperty, PolylineDashMaterialProperty, VerticalOrigin, Cartesian3, type Entity, type Scene } from "cesium";
import { decomposedHeight, formatHeightNumber, type MeasurementTool } from "./measurementUtils";

export function drawMeasurement(source: CustomDataSource, tool: MeasurementTool, points: readonly Cartesian3[], text: string): Entity[] {
  if (tool === "height") return drawHeight(source, points);
  const graphics: Entity[] = [];
  // Alpha < 1 keeps our geometry in the translucent pass, outside opaque picking
  // depth. Do not enable pickTranslucentDepth: it would make overlays pick themselves.
  const color = Color.fromCssColorString("#66e4f2").withAlpha(0.95);
  for (const point of points) graphics.push(source.entities.add({
    position: point,
    point: { pixelSize: 9, color, outlineColor: Color.BLACK.withAlpha(0.95), outlineWidth: 2, disableDepthTestDistance: Infinity },
  }));
  if (points.length >= 2) {
    const line = tool === "area" && points.length >= 3 ? [...points, points[0]] : [...points];
    graphics.push(source.entities.add({ polyline: {
      positions: line, width: 3, arcType: ArcType.NONE, clampToGround: false,
      material: new PolylineOutlineMaterialProperty({ color, outlineColor: Color.BLACK.withAlpha(0.95), outlineWidth: 1 }),
      depthFailMaterial: color.withAlpha(0.5),
    } }));
  }
  if (tool === "area" && points.length >= 3) graphics.push(source.entities.add({ polygon: {
    hierarchy: new PolygonHierarchy([...points]), perPositionHeight: true, material: color.withAlpha(0.14),
  } }));
  if (text && points.length) graphics.push(source.entities.add({
    position: points[points.length - 1],
    label: {
      text, font: "13px sans-serif", fillColor: Color.WHITE.withAlpha(0.99),
      outlineColor: Color.BLACK.withAlpha(0.99), outlineWidth: 2, style: LabelStyle.FILL_AND_OUTLINE,
      showBackground: true, backgroundColor: Color.fromCssColorString("#26323d").withAlpha(0.9),
      backgroundPadding: new Cartesian2(8, 6), pixelOffset: new Cartesian2(12, -16),
      verticalOrigin: VerticalOrigin.BOTTOM, disableDepthTestDistance: Infinity,
    },
  }));
  return graphics;
}

const preferredOffsets = new WeakMap<Entity, Cartesian2>();

function drawHeight(source: CustomDataSource, points: readonly Cartesian3[]): Entity[] {
  const graphics: Entity[] = [];
  const color = Color.fromCssColorString("#66e4f2").withAlpha(0.95);
  function label(position: Cartesian3, text: string, offset: Cartesian2, marker = false) {
    const entity = source.entities.add({
      position,
      ...(marker ? { point: { pixelSize: 9, color, outlineColor: Color.BLACK.withAlpha(0.95), outlineWidth: 2, disableDepthTestDistance: Infinity } } : {}),
      label: {
        text, font: "13px sans-serif", fillColor: Color.WHITE.withAlpha(0.99),
        outlineColor: Color.BLACK.withAlpha(0.99), outlineWidth: 2, style: LabelStyle.FILL_AND_OUTLINE,
        showBackground: true, backgroundColor: Color.fromCssColorString("#26323d").withAlpha(0.9),
        backgroundPadding: new Cartesian2(8, 6), pixelOffset: offset,
        verticalOrigin: VerticalOrigin.BOTTOM, disableDepthTestDistance: Infinity,
      },
    });
    preferredOffsets.set(entity, offset); graphics.push(entity);
  }
  points.forEach((point, index) => label(point, index === 0 ? "A" : "B", new Cartesian2(0, -16), true));
  if (points.length < 2) return graphics;
  const [a, b] = points;
  const m = decomposedHeight(points);
  function line(positions: Cartesian3[], dashed = false) {
    if (Cartesian3.distance(positions[0], positions[positions.length - 1]) < 1e-6) return;
    const material = dashed ? new PolylineDashMaterialProperty({ color, dashLength: 12 })
      : new PolylineOutlineMaterialProperty({ color, outlineColor: Color.BLACK.withAlpha(0.95), outlineWidth: 1 });
    graphics.push(source.entities.add({ polyline: {
      positions, width: dashed ? 2 : 3, arcType: ArcType.NONE, clampToGround: false,
      material, depthFailMaterial: dashed ? material : color.withAlpha(0.5),
    } }));
  }
  line([a, b]); line([a, m.corner], true); line([m.corner, b], true);
  label(Cartesian3.midpoint(a, b, new Cartesian3()), "3D: " + formatHeightNumber(m.spatial) + " m", new Cartesian2(0, -42));
  label(Cartesian3.midpoint(a, m.corner, new Cartesian3()), "H: " + formatHeightNumber(m.horizontal) + " m", new Cartesian2(0, 30));
  // The drawn vertical is the exact ENU component; ΔZ remains the cartographic height difference.
  label(Cartesian3.midpoint(m.corner, b, new Cartesian3()), "ΔZ: " + formatHeightNumber(m.delta) + " m"
    + (Math.abs(m.verticalLocal - m.delta) >= 0.005 ? " · V local: " + formatHeightNumber(m.verticalLocal) + " m" : ""), new Cartesian2(0, 58));
  if (m.angle !== null) {
    const radius = Math.min(m.horizontal, m.spatial) * 0.18;
    const arc: Cartesian3[] = [];
    if (radius > 0.001 && m.horizontal > 0.001) {
      for (let i = 0; i <= 24; i++) {
        const theta = m.angle * Math.PI / 180 * i / 24;
        const local = new Cartesian3(m.localA.x + radius * Math.cos(theta) * m.vector.x / m.horizontal,
          m.localA.y + radius * Math.cos(theta) * m.vector.y / m.horizontal, m.localA.z + radius * Math.sin(theta));
        arc.push(Matrix4.multiplyByPoint(m.frame, local, new Cartesian3()));
      }
      line(arc);
    }
    label(arc[Math.floor(arc.length / 2)] ?? a, "α: " + formatHeightNumber(m.angle) + "°", new Cartesian2(0, -70));
  }
  return graphics;
}

// Recompute only screen label offsets after camera changes. World geometry stays fixed.
export function layoutHeightLabels(source: CustomDataSource, scene: Scene): boolean {
  const occupied: { x: number; y: number; w: number; h: number }[] = [];
  let changed = false;
  const time = JulianDate.now();
  for (const entity of source.entities.values) {
    const preferred = preferredOffsets.get(entity);
    if (!preferred || !entity.label || !entity.position) continue;
    const world = entity.position.getValue(time);
    if (!world) continue;
    const screen = SceneTransforms.worldToWindowCoordinates(scene, world);
    if (!screen) continue;
    const text = entity.label.text?.getValue(time) ?? "";
    const width = Math.max(28, text.length * 8 + 16);
    let offsetY = preferred.y;
    let box = { x: screen.x + preferred.x - width / 2, y: screen.y + offsetY - 28, w: width, h: 30 };
    for (let attempts = 0; attempts < 64; attempts++) {
      if (!occupied.some((other) => box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y)) break;
      offsetY -= 32; box = { ...box, y: screen.y + offsetY - 28 };
    }
    occupied.push(box);
    const offset = new Cartesian2(preferred.x, offsetY);
    if (!Cartesian2.equals(entity.label.pixelOffset?.getValue(time), offset)) {
      entity.label.pixelOffset = new ConstantProperty(offset); changed = true;
    }
  }
  return changed;
}
