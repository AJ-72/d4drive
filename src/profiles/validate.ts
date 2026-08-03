import type { TrafficProfile, VehicleKind } from './types';

export function validateProfile(p: TrafficProfile): void {
  const kinds: VehicleKind[] = ['car', 'auto', 'bus', 'bike'];
  const sum = kinds.reduce((a, k) => a + (p.fleetMix[k] ?? 0), 0);
  if (Math.abs(sum - 1) > 1e-6) {
    throw new Error(`Profile "${p.id}": fleetMix sums to ${sum}, must be 1.0`);
  }
  const unit: (keyof TrafficProfile)[] = [
    'laneDiscipline',
    'overtakeUrgency',
    'cutInAggression',
    'yieldProbability',
    'jaywalkProbability',
    'pedestrianHesitation',
  ];
  for (const f of unit) {
    const v = p[f] as unknown as number;
    if (!(v >= 0 && v <= 1)) {
      throw new Error(`Profile "${p.id}": ${String(f)}=${v}, must be 0..1`);
    }
  }
  if (p.minFollowingDistancePx <= 0) {
    throw new Error(`Profile "${p.id}": minFollowingDistancePx must be > 0`);
  }
  if (p.spawnRatePerMin <= 0) {
    throw new Error(`Profile "${p.id}": spawnRatePerMin must be > 0`);
  }
}
