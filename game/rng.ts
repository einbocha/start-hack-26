export type Rng = () => number;

// Deterministic PRNG for debug-friendly simulations.
export function mulberry32(seed: number): Rng {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFrom(seed: number, salt: number): Rng {
  return mulberry32((seed ^ (salt * 0x9E3779B1)) >>> 0);
}

