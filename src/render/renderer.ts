import { VEHICLE_SPECS } from '../profiles/types';
import { laneBoundaryY, roadWidthPx, type Road } from '../road/road';
import type { Player } from '../sim/player';

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
  player: '#e8c547',
} as const;

export function cameraX(player: Player, road: Road): number {
  const target = player.x - VIEW_W * CAMERA_X_FRACTION;
  return Math.max(0, Math.min(target, Math.max(0, road.lengthPx - VIEW_W)));
}

export function render(ctx: CanvasRenderingContext2D, road: Road, player: Player): void {
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

  // Dashed lane boundaries. Drawn in world space so they scroll with the camera —
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

  const spec = VEHICLE_SPECS.car;
  ctx.fillStyle = COL.player;
  ctx.fillRect(
    player.x - camX - spec.lengthPx / 2,
    roadTop + player.y - spec.widthPx / 2,
    spec.lengthPx,
    spec.widthPx,
  );
}
