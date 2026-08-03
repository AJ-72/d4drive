import { VEHICLE_SPECS, type VehicleKind } from '../profiles/types';
import { laneBoundaryY, roadWidthPx, type Road } from '../road/road';
import type { Player } from '../sim/player';
import { PED_RADIUS_PX, type World } from '../sim/world';

// HANDOFF A6: fixed logical size, scaled to fit. Deliberately not responsive —
// every tester must see the same framing.
export const VIEW_W = 1280;
export const VIEW_H = 720;

// HANDOFF A5: camera sits ~1/3 from the left, so more road is visible ahead than behind.
const CAMERA_X_FRACTION = 1 / 3;

const COL = {
  sky: '#14161a',
  shoulder: '#2c3038',
  asphalt: '#3a3f48',
  edge: '#5a6270',
  dash: '#8b93a1',
  crossing: '#6f7885',
  player: '#e8c547',
  ped: '#d9d4c7',
  pedJay: '#e0a3a3',
} as const;

// HANDOFF A8: no art assets. Distinct silhouettes and colours, sized from
// VEHICLE_SPECS, so a bus / auto / bike are told apart at a glance — C3's last
// Trivandrum bullet requires exactly that.
const KIND_COL: Record<VehicleKind, string> = {
  car: '#7f9bb5',
  auto: '#4fb0a5',
  bus: '#c98b4b',
  bike: '#b0708f',
};

export function cameraX(player: Player, road: Road): number {
  const target = player.x - VIEW_W * CAMERA_X_FRACTION;
  return Math.max(0, Math.min(target, Math.max(0, road.lengthPx - VIEW_W)));
}

function vehicleBody(
  ctx: CanvasRenderingContext2D,
  kind: VehicleKind,
  cx: number,
  cy: number,
): void {
  const spec = VEHICLE_SPECS[kind];
  const w = spec.lengthPx;
  const h = spec.widthPx;
  ctx.fillStyle = KIND_COL[kind];

  if (kind === 'auto') {
    // Three-wheeler: tapered nose, so it reads as an auto even at a glance.
    ctx.beginPath();
    ctx.moveTo(cx + w / 2, cy);
    ctx.lineTo(cx - w / 2, cy - h / 2);
    ctx.lineTo(cx - w / 2, cy + h / 2);
    ctx.closePath();
    ctx.fill();
    return;
  }

  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);

  if (kind === 'bus') {
    // Window band down the length: the long body plus banding reads as a bus.
    ctx.fillStyle = '#8f6234';
    ctx.fillRect(cx - w / 2 + 6, cy - h / 2 + 4, w - 12, 4);
    ctx.fillRect(cx - w / 2 + 6, cy + h / 2 - 8, w - 12, 4);
  }
}

export function render(ctx: CanvasRenderingContext2D, world: World): void {
  const { road, player } = world;
  const camX = cameraX(player, road);
  const rw = roadWidthPx(road);
  const roadTop = (VIEW_H - rw) / 2;

  ctx.fillStyle = COL.sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = COL.shoulder;
  ctx.fillRect(0, roadTop - road.shoulderPx, VIEW_W, rw + road.shoulderPx * 2);

  ctx.fillStyle = COL.asphalt;
  ctx.fillRect(0, roadTop, VIEW_W, rw);

  ctx.fillStyle = COL.edge;
  ctx.fillRect(0, roadTop - 3, VIEW_W, 3);
  ctx.fillRect(0, roadTop + rw, VIEW_W, 3);

  // Marked crossings. Pedestrians in Singapore use only these, so they must be
  // visible for a tester to notice the difference at all.
  ctx.fillStyle = COL.crossing;
  for (const cx of road.crossingsPx) {
    const sx = cx - camX;
    if (sx < -40 || sx > VIEW_W + 40) continue;
    for (let s = 0; s < rw; s += 18) {
      ctx.fillRect(sx - 14, roadTop + s + 3, 28, 10);
    }
  }

  // Dashed lane boundaries, drawn in world space so they scroll with the camera —
  // without this the road looks static and speed is invisible.
  ctx.fillStyle = COL.dash;
  const DASH = 44;
  const GAP = 34;
  for (let lane = 0; lane < road.laneCount - 1; lane++) {
    const y = roadTop + laneBoundaryY(road, lane) - 1.5;
    const start = Math.floor(camX / (DASH + GAP)) * (DASH + GAP);
    for (let x = start; x < camX + VIEW_W; x += DASH + GAP) {
      ctx.fillRect(x - camX, y, DASH, 3);
    }
  }

  for (const a of world.agents) {
    const sx = a.x - camX;
    if (sx < -140 || sx > VIEW_W + 140) continue;
    vehicleBody(ctx, a.kind, sx, roadTop + a.y);
  }

  for (const ped of world.pedestrians) {
    const sx = ped.x - camX;
    if (sx < -20 || sx > VIEW_W + 20) continue;
    ctx.fillStyle = ped.jaywalking ? COL.pedJay : COL.ped;
    ctx.beginPath();
    ctx.arc(sx, roadTop + ped.y, PED_RADIUS_PX, 0, Math.PI * 2);
    ctx.fill();
  }

  const spec = VEHICLE_SPECS.car;
  ctx.fillStyle = COL.player;
  ctx.fillRect(
    player.x - camX - spec.lengthPx / 2,
    roadTop + player.y - spec.widthPx / 2,
    spec.lengthPx,
    spec.widthPx,
  );

  if (world.arrived) {
    ctx.fillStyle = 'rgba(20,22,26,0.72)';
    ctx.fillRect(0, VIEW_H / 2 - 60, VIEW_W, 120);
    ctx.fillStyle = '#e8c547';
    ctx.font = '44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Arrived', VIEW_W / 2, VIEW_H / 2 + 16);
  }
}
