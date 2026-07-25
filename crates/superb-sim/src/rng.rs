//! A dozen lines of PRNG, owned by the simulator rather than borrowed from a
//! crate (BRIEF-014's Done clause: "implement a small seeded PRNG inside
//! `superb-sim` — splitmix64 or xorshift — rather than taking a
//! dependency"). `superb-core` itself never draws a random number (law 2:
//! no RNG inside the core); every draw this crate makes exists to stand in
//! for a human reader's behaviour, and it happens entirely out here, in the
//! host.
//!
//! splitmix64, chosen over xorshift for one reason: it needs no non-zero
//! seed invariant to reason about, so a seed of `0` is exactly as usable as
//! any other — one fewer footgun for a report that is supposed to be
//! reproducible from the seed alone.

/// A splitmix64 generator, advancing one `u64` of internal state per draw.
/// Every method is deterministic in that state: the same seed, drawn from in
/// the same order, produces the same sequence forever — the property this
/// whole crate's determinism claim rests on.
#[derive(Debug, Clone)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// Seed a generator. Any `u64` is a valid seed, `0` included.
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    /// One raw 64-bit draw, advancing the generator's state.
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A uniform draw in `[0.0, 1.0)`, built from the top 53 bits of a raw
    /// draw — enough bits to fill an `f64` mantissa exactly, the same
    /// technique most PRNGs use to turn an integer stream into a uniform
    /// float stream.
    pub fn next_unit(&mut self) -> f64 {
        let top53 = self.next_u64() >> 11;
        (top53 as f64) * (1.0 / (1u64 << 53) as f64)
    }

    /// A uniform draw in `[low, high)`.
    pub fn range(&mut self, low: f64, high: f64) -> f64 {
        low + (high - low) * self.next_unit()
    }

    /// `true` with probability `p` (clamped to `[0.0, 1.0]` so a caller
    /// passing an out-of-range rate cannot make this panic or misbehave).
    pub fn chance(&mut self, p: f64) -> bool {
        self.next_unit() < p.clamp(0.0, 1.0)
    }

    /// A uniform integer in `[0, bound)`. `bound == 0` returns `0` rather
    /// than panicking — the one caller-error case this crate's own bounded
    /// pools could hit if a config value were ever misconfigured to zero.
    pub fn below(&mut self, bound: usize) -> usize {
        if bound == 0 {
            return 0;
        }
        (self.next_u64() % bound as u64) as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_seed_produces_the_same_sequence() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        let sequence_a: Vec<u64> = (0..10).map(|_| a.next_u64()).collect();
        let sequence_b: Vec<u64> = (0..10).map(|_| b.next_u64()).collect();
        assert_eq!(sequence_a, sequence_b);
    }

    #[test]
    fn different_seeds_produce_different_sequences() {
        let mut a = Rng::new(1);
        let mut b = Rng::new(2);
        let sequence_a: Vec<u64> = (0..10).map(|_| a.next_u64()).collect();
        let sequence_b: Vec<u64> = (0..10).map(|_| b.next_u64()).collect();
        assert_ne!(sequence_a, sequence_b);
    }

    #[test]
    fn next_unit_stays_in_zero_one() {
        let mut rng = Rng::new(7);
        for _ in 0..1000 {
            let value = rng.next_unit();
            assert!((0.0..1.0).contains(&value), "{value} out of range");
        }
    }

    #[test]
    fn zero_seed_is_a_valid_seed() {
        let mut rng = Rng::new(0);
        // Would loop forever on a generator that treats 0 as "unseeded";
        // splitmix64 has no such state, so this simply produces a sequence.
        let draws: Vec<u64> = (0..5).map(|_| rng.next_u64()).collect();
        assert!(draws.iter().any(|&d| d != 0));
    }

    #[test]
    fn below_never_reaches_the_bound() {
        let mut rng = Rng::new(99);
        for _ in 0..1000 {
            assert!(rng.below(7) < 7);
        }
    }
}
