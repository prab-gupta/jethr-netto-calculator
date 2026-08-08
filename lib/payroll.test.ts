import { describe, expect, it } from "vitest";
import { calcNet } from "./payroll";
import {
  BONUS_CUNEO_TIERS,
  DETRAZIONE_ULTERIORE_65,
  MILANO_COMUNALE,
} from "./rates2026";

/** Money comparison: two decimals is the resolution that matters here. */
const eur = (n: number) => Math.round(n * 100) / 100;

describe("golden vector — RAL 30,000, 13 mensilita", () => {
  const r = calcNet(30_000, 13);

  it("INPS is 9.19% (below the 1% surcharge threshold)", () => {
    expect(eur(r.inps)).toBe(2_757);
  });

  it("imponibile fiscale is RAL minus contributions", () => {
    expect(eur(r.imponibileFiscale)).toBe(27_243);
  });

  it("IRPEF lorda is entirely in the 23% bracket", () => {
    expect(eur(r.irpefLorda)).toBe(6_265.89);
  });

  it("detrazione lavoro dipendente uses the 15k-28k taper", () => {
    // 1,910 + 1,190 * (28,000 - 27,243) / 13,000
    expect(eur(r.detrazioni.lavoroDipendente)).toBe(1_979.29);
  });

  it("picks up the 65 ulteriore detrazione and the 1,000 cuneo detrazione", () => {
    expect(r.detrazioni.ulteriore65).toBe(65);
    expect(r.detrazioni.cuneo).toBe(1_000);
  });

  it("IRPEF netta", () => {
    expect(eur(r.irpefNetta)).toBe(3_221.6);
  });

  it("addizionale regionale is progressive, not flat", () => {
    // 15,000 * 1.23% = 184.50, plus 12,243 * 1.58% = 193.44
    expect(eur(r.addizionaleRegionale)).toBe(377.94);
    // A flat 1.23% would be ~335 — this test exists to catch that mistake.
    expect(eur(r.addizionaleRegionale)).not.toBe(eur(27_243 * 0.0123));
  });

  it("addizionale comunale applies to the whole imponibile (over 23k)", () => {
    expect(eur(r.addizionaleComunale)).toBe(217.94);
  });

  it("no bonus cuneo above 20k", () => {
    expect(r.bonusCuneo).toBe(0);
  });

  it("lands in the band public calculators report (~1,800-1,850/month)", () => {
    expect(r.nettoMensile).toBeGreaterThan(1_780);
    expect(r.nettoMensile).toBeLessThan(1_860);
  });

  it("TFR accrues at ~6.91% and is excluded from net", () => {
    expect(eur(r.tfrAnnuo)).toBe(2_072.22);
    expect(r.nettoAnnuo).toBe(
      r.ral - r.totalTrattenute + r.bonusCuneo, // no TFR term
    );
  });
});

describe("bracket and threshold behaviour", () => {
  it("15,000 — bonus cuneo applies, detrazione at maximum", () => {
    const r = calcNet(15_000);
    expect(r.detrazioni.lavoroDipendente).toBe(1_955);
    expect(r.bonusCuneo).toBeGreaterThan(0);
  });

  it("40,000 — exercises the 33% bracket and both mid-range tapers", () => {
    const r = calcNet(40_000);
    const imponibile = r.imponibileFiscale;
    expect(imponibile).toBeGreaterThan(28_000);

    // If the middle bracket were still 35%, IRPEF lorda would be ~200 higher.
    expect(eur(r.irpefLorda)).toBe(
      eur(28_000 * 0.23 + (imponibile - 28_000) * 0.33),
    );

    // Pin both taper formulas by value. Without these the branches execute
    // but nothing would catch a wrong divisor or a flipped subtraction.
    expect(eur(r.detrazioni.lavoroDipendente)).toBe(
      eur((1_910 * (50_000 - imponibile)) / 22_000),
    );
    expect(eur(r.detrazioni.cuneo)).toBe(
      eur((1_000 * (40_000 - imponibile)) / 8_000),
    );
  });

  it("60,000 — all three IRPEF brackets, top regional band, 1% INPS surcharge", () => {
    const r = calcNet(60_000);
    const imponibile = r.imponibileFiscale;
    expect(imponibile).toBeGreaterThan(50_000);

    // 9.19% on everything, plus 1% on the slice above 56,224.
    expect(eur(r.inps)).toBe(eur(60_000 * 0.0919 + (60_000 - 56_224) * 0.01));
    expect(r.detrazioni.lavoroDipendente).toBe(0);

    // The 43% band, pinned explicitly.
    expect(eur(r.irpefLorda)).toBe(
      eur(
        28_000 * 0.23 +
          22_000 * 0.33 +
          (imponibile - 50_000) * 0.43,
      ),
    );

    // All four Lombardia bands. These thresholds deliberately differ from
    // IRPEF's — reusing IRPEF_BRACKETS here would pass a naive test.
    expect(eur(r.addizionaleRegionale)).toBe(
      eur(
        15_000 * 0.0123 +
          13_000 * 0.0158 +
          22_000 * 0.0172 +
          (imponibile - 50_000) * 0.0173,
      ),
    );
  });

  it("bonus cuneo pays the exact tier rate on the whole reddito", () => {
    for (const [ral, rate] of [
      [8_000, 0.071],
      [12_000, 0.053],
      [18_000, 0.048],
    ] as const) {
      const r = calcNet(ral);
      expect(eur(r.bonusCuneo)).toBe(eur(r.imponibileFiscale * rate));
    }
  });

  it("8,500 — no-tax area: IRPEF netta is exactly zero, never negative", () => {
    const r = calcNet(8_500);
    expect(r.irpefNetta).toBe(0);
  });

  it("0 — everything zero, no NaN, no division by zero", () => {
    const r = calcNet(0);
    expect(r.nettoAnnuo).toBe(0);
    expect(r.nettoMensile).toBe(0);
    expect(r.aliquotaEffettiva).toBe(0);
    expect(Number.isNaN(r.nettoAnnuo)).toBe(false);
  });

  it("rejects negative and non-finite input", () => {
    expect(() => calcNet(-1)).toThrow(RangeError);
    expect(() => calcNet(Number.NaN)).toThrow(RangeError);
  });

  it("14 mensilita changes only the divisor", () => {
    const a = calcNet(30_000, 13);
    const b = calcNet(30_000, 14);
    expect(eur(a.nettoAnnuo)).toBe(eur(b.nettoAnnuo));
    expect(eur(b.nettoMensile)).toBe(eur(b.nettoAnnuo / 14));
  });
});

/**
 * The Milano addizionale comunale is a cliff: at or below 23,000 of imponibile
 * nothing is due; one euro above, 0.80% of the WHOLE imponibile is due.
 * These two tests pin that shape so nobody "fixes" it into a taper.
 */
describe("Milano addizionale comunale cliff", () => {
  const { exemptionThreshold, rate } = MILANO_COMUNALE;
  // imponibile = ral * (1 - 0.0919), so invert to sit either side of 23,000.
  const ralAtThreshold = exemptionThreshold / (1 - 0.0919);

  it("is exactly zero at or below the threshold", () => {
    const r = calcNet(Math.floor(ralAtThreshold) - 1);
    expect(r.imponibileFiscale).toBeLessThanOrEqual(exemptionThreshold);
    expect(r.addizionaleComunale).toBe(0);
  });

  it("applies to the entire imponibile just above the threshold", () => {
    const r = calcNet(Math.ceil(ralAtThreshold) + 1);
    expect(r.imponibileFiscale).toBeGreaterThan(exemptionThreshold);
    expect(eur(r.addizionaleComunale)).toBe(eur(r.imponibileFiscale * rate));
    // Not a taper on the excess — that would be a couple of cents, not ~184.
    expect(r.addizionaleComunale).toBeGreaterThan(180);
  });
});

/**
 * The 65 euro ulteriore detrazione is a FLAT amount over a closed range
 * (25,000-35,000 of reddito), so it does not taper away — it vanishes. That
 * makes the top of the range a second cliff, worth 65 euro.
 *
 * Smaller than the Milano one and far less known. Found by the sweep below.
 */
describe("ulteriore detrazione 65 cliff", () => {
  const { to } = DETRAZIONE_ULTERIORE_65;
  const ralAtThreshold = to / (1 - 0.0919);

  it("grants 65 just below the top of the range and nothing just above", () => {
    const below = calcNet(Math.floor(ralAtThreshold) - 1);
    const above = calcNet(Math.ceil(ralAtThreshold) + 1);
    expect(below.imponibileFiscale).toBeLessThanOrEqual(to);
    expect(above.imponibileFiscale).toBeGreaterThan(to);
    expect(below.detrazioni.ulteriore65).toBe(65);
    expect(above.detrazioni.ulteriore65).toBe(0);
  });
});

/**
 * The single highest-value test: sweep the whole realistic range and assert
 * net never falls — EXCEPT at the documented legal cliffs.
 *
 * Written as "these specific decreases, here, this big" rather than "never
 * decreases", because the naive version fails on correct code and tempts
 * someone into smoothing a real tax rule.
 *
 * The sweep is what found the 65 euro cliff in the first place; the plan had
 * only anticipated the Milano one.
 */
describe("monotonicity sweep, with documented exceptions", () => {
  /**
   * Probe either side of an imponibile threshold to isolate a cliff's size.
   *
   * The epsilon has to be tiny: straddling by +/-0.5 of RAL also moves gross
   * by a whole euro, which hands ~0.60 of net back and understates the cliff.
   * At +/-0.005 that contamination is under a cent.
   */
  const EPS = 0.005;
  const cliffAt = (imponibileThreshold: number) => {
    const ral = imponibileThreshold / (1 - 0.0919);
    return calcNet(ral - EPS).nettoAnnuo - calcNet(ral + EPS).nettoAnnuo;
  };

  it("net rises with gross except at exactly three known thresholds", () => {
    // Start below the lowest cliff (8,500 imponibile ~= 9,360 RAL) and step
    // finely enough that a ~150 euro drop cannot be masked by the gross gain.
    // The original sweep started at 10,000 with step 100 and missed the
    // bonus-cuneo cliff entirely on both counts.
    const step = 25;
    const drops: { ral: number; imponibile: number }[] = [];

    let prev = calcNet(5_000);
    for (let ral = 5_000 + step; ral <= 100_000; ral += step) {
      const cur = calcNet(ral);
      if (cur.nettoAnnuo < prev.nettoAnnuo) {
        drops.push({ ral, imponibile: cur.imponibileFiscale });
      }
      prev = cur;
    }

    expect(drops).toHaveLength(3);

    const thresholds = [
      BONUS_CUNEO_TIERS[0].upTo, // 8,500 — bonus cuneo re-prices at 5.3%
      MILANO_COMUNALE.exemptionThreshold, // 23,000 — addizionale comunale
      DETRAZIONE_ULTERIORE_65.to, // 35,000 — the 65 euro credit
    ];
    drops.forEach((drop, i) => {
      expect(drop.imponibile).toBeGreaterThan(thresholds[i]);
      expect(drop.imponibile).toBeLessThan(thresholds[i] + step);
    });
  });

  it("the bonus-cuneo cliff costs the difference between the 7.1% and 5.3% tiers", () => {
    const [t0, t1] = BONUS_CUNEO_TIERS;
    expect(cliffAt(t0.upTo)).toBeCloseTo(t0.upTo * (t0.rate - t1.rate), 0);
  });

  it("the Milano cliff costs 0.80% of 23,000", () => {
    expect(eur(cliffAt(MILANO_COMUNALE.exemptionThreshold))).toBeCloseTo(
      eur(MILANO_COMUNALE.exemptionThreshold * MILANO_COMUNALE.rate),
      0,
    );
  });

  it("the ulteriore-detrazione cliff costs 65", () => {
    expect(cliffAt(DETRAZIONE_ULTERIORE_65.to)).toBeCloseTo(65, 0);
  });
});
