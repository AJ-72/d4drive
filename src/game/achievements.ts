export interface Stats {
  fish: number;
  goldFish: number;
  jumps: number;
  stunts: number;
  topKmh: number;
  distanceM: number;
  nightDriveM: number;
  horns: number;
  squawks: number;
  citySwitches: number;
  arrived: boolean;
  crashes: number;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  test: (s: Stats) => boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'fish1', icon: '🐟', title: 'First catch', desc: 'Scoop up your first fish', test: (s) => s.fish >= 1 },
  { id: 'gold', icon: '✨', title: 'Golden legend', desc: 'Catch a golden fish (+5)', test: (s) => s.goldFish >= 1 },
  { id: 'fish10', icon: '🎣', title: 'Pouch filling up', desc: 'Catch 10 fish', test: (s) => s.fish >= 10 },
  { id: 'fish50', icon: '👑', title: 'King of the coast', desc: 'Catch 50 fish in total', test: (s) => s.fish >= 50 },
  { id: 'jump', icon: '🛫', title: 'Liftoff!', desc: 'Jump for the first time', test: (s) => s.jumps >= 1 },
  { id: 'stunt', icon: '🤸', title: 'Look, no wings', desc: 'Pull a stunt (F)', test: (s) => s.stunts >= 1 },
  { id: 'stunt3', icon: '🎪', title: 'Acrobatic pelican', desc: 'Pull 3 stunts', test: (s) => s.stunts >= 3 },
  { id: 'kmh60', icon: '💨', title: 'Wind in the feathers', desc: 'Reach 60 km/h', test: (s) => s.topKmh >= 60 },
  { id: 'kmh95', icon: '⚡', title: 'Speed pelican', desc: 'Break 95 km/h', test: (s) => s.topKmh >= 95 },
  { id: 'km1', icon: '🛣️', title: 'First kilometre', desc: 'Drive 1 km', test: (s) => s.distanceM >= 1000 },
  { id: 'arrive', icon: '🏁', title: 'Survived the commute', desc: 'Reach the finish arch', test: (s) => s.arrived },
  { id: 'night', icon: '🌙', title: 'Night drive', desc: 'Drive 500 m under the stars', test: (s) => s.nightDriveM >= 500 },
  { id: 'horn', icon: '📯', title: 'Local custom', desc: 'Sound the horn 10 times', test: (s) => s.horns >= 10 },
  { id: 'culture', icon: '🌏', title: 'Culture shock', desc: 'Switch city mid-drive (T)', test: (s) => s.citySwitches >= 1 },
];

export function emptyStats(): Stats {
  return {
    fish: 0,
    goldFish: 0,
    jumps: 0,
    stunts: 0,
    topKmh: 0,
    distanceM: 0,
    nightDriveM: 0,
    horns: 0,
    squawks: 0,
    citySwitches: 0,
    arrived: false,
    crashes: 0,
  };
}
