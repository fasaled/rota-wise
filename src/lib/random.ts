export type Rng = () => number;

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh 32-bit seed for runs that were not given one. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

/** Derive the seed of the n-th attempt from a base seed. */
export function deriveSeed(seed: number, attempt: number): number {
  return (seed + Math.imul(attempt, 0x9e3779b1)) >>> 0;
}
