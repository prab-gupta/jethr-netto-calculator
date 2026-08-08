/**
 * Every rate, bracket and threshold used by the calculator, for tax year 2026.
 *
 * Data only — no logic lives here. Updating for 2027 should be an edit to this
 * file and nothing else.
 *
 * Each constant carries its legal source and the date it was checked.
 */

export const TAX_YEAR = 2026;

/* ------------------------------------------------------------------ *
 * 1. INPS — contributi previdenziali a carico del dipendente
 * ------------------------------------------------------------------ */

/**
 * Standard IVS rate for an impiegato in a firm with >15 employees.
 * Sector and firm-size variations are not modelled.
 */
export const INPS_RATE = 0.0919;

/**
 * Above the first pension bracket an extra 1% is due from the employee.
 * 2026 annual value: €56,224. INPS also publishes a monthly figure of
 * €4,685, which is the rounded monthly threshold used for period-by-period
 * withholding — it does NOT multiply back to the annual figure
 * (4,685 x 12 = 56,220). We are computing an annual projection, so the
 * annual value is the correct one to use here.
 * Source: INPS circ. n. 6/2026. Checked 2026-08-08.
 */
export const INPS_EXTRA_THRESHOLD = 56_224;
export const INPS_EXTRA_RATE = 0.01;

/* ------------------------------------------------------------------ *
 * 2. IRPEF — three progressive brackets
 * ------------------------------------------------------------------ */

export type Bracket = { upTo: number; rate: number };

/**
 * Legge di Bilancio 2026 (L. 199/2025, art. 1 co. 3), in force 1 Jan 2026.
 *
 * NOTE: the middle bracket is 33%, cut from 35% for 2026. Most published
 * material still says 35% — do not "correct" this back.
 * Checked 2026-08-08.
 */
export const IRPEF_BRACKETS: Bracket[] = [
  { upTo: 28_000, rate: 0.23 },
  { upTo: 50_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.43 },
];

/* ------------------------------------------------------------------ *
 * 3-5. Detrazioni (tax credits, applied against IRPEF lorda)
 * ------------------------------------------------------------------ */

/**
 * Detrazione per lavoro dipendente — art. 13 TUIR.
 * Confirmed unchanged for 2026. Checked 2026-08-08.
 *
 * <= 15,000            -> 1,955 flat
 * 15,000 - 28,000      -> 1,910 + 1,190 * (28,000 - R) / 13,000
 * 28,000 - 50,000      -> 1,910 * (50,000 - R) / 22,000
 * > 50,000             -> 0
 */
export const DETRAZIONE_LAVORO = {
  flatUpTo: 15_000,
  flatAmount: 1_955,
  midBase: 1_910,
  midVariable: 1_190,
  midTo: 28_000,
  midSpan: 13_000,
  highBase: 1_910,
  highTo: 50_000,
  highSpan: 22_000,
} as const;

/**
 * Ulteriore detrazione: flat €65 for reddito between 25k and 35k.
 *
 * *** ALSO A CLIFF. *** It is a flat amount over a closed range, not a taper,
 * so at 35,000.01 the whole €65 disappears at once and net pay drops. Smaller
 * and much less known than the Milano one below, but the same shape.
 * Found by the monotonicity sweep in payroll.test.ts, not by reading the law.
 */
export const DETRAZIONE_ULTERIORE_65 = {
  amount: 65,
  from: 25_000,
  to: 35_000,
} as const;

/**
 * Detrazione "cuneo fiscale" for reddito 20,000-40,000.
 * 20,000 - 32,000  -> 1,000 flat
 * 32,000 - 40,000  -> 1,000 * (40,000 - R) / 8,000
 */
export const DETRAZIONE_CUNEO = {
  from: 20_000,
  flatTo: 32_000,
  taperTo: 40_000,
  amount: 1_000,
  taperSpan: 8_000,
} as const;

/* ------------------------------------------------------------------ *
 * 8. Bonus cuneo fiscale — tax-exempt cash, NOT a detrazione
 * ------------------------------------------------------------------ */

/**
 * For reddito <= 20,000 the employee receives an exempt supplement
 * calculated as a percentage of employment income. It is added straight
 * to net: it is not taxed and does not reduce IRPEF.
 *
 * *** THE TIER BOUNDARIES ARE CLIFFS. *** Each rate applies to the WHOLE
 * reddito, not to a slice, so crossing a boundary re-prices everything at
 * the lower rate. At 8,500 the drop is real money: 8,500 x 7.1% = 603.50
 * becomes 8,500 x 5.3% = 450.50, so net falls ~153 for one extra euro of
 * gross. (The 15,000 boundary is also a step down in the supplement, but
 * the detrazione lavoro dipendente more than offsets it there, so net
 * still rises — see the monotonicity test.)
 *
 * Do NOT reach for applyBrackets here: this is deliberately not progressive.
 */
export const BONUS_CUNEO_TIERS: Bracket[] = [
  { upTo: 8_500, rate: 0.071 },
  { upTo: 15_000, rate: 0.053 },
  { upTo: 20_000, rate: 0.048 },
];

/* ------------------------------------------------------------------ *
 * 6. Addizionale regionale — Lombardia
 * ------------------------------------------------------------------ */

/**
 * Progressive, four brackets, applied to the imponibile fiscale.
 *
 * NOTE: these thresholds are NOT the national IRPEF scaglioni — there is a
 * break at 15,000 that IRPEF does not have. Do not reuse IRPEF_BRACKETS here.
 * Checked 2026-08-08.
 */
export const LOMBARDIA_BRACKETS: Bracket[] = [
  { upTo: 15_000, rate: 0.0123 },
  { upTo: 28_000, rate: 0.0158 },
  { upTo: 50_000, rate: 0.0172 },
  { upTo: Infinity, rate: 0.0173 },
];

/* ------------------------------------------------------------------ *
 * 7. Addizionale comunale — Milano
 * ------------------------------------------------------------------ */

/**
 * Milano: 0.80% with an exemption threshold of €23,000 of imponibile.
 *
 * *** THIS IS A CLIFF, NOT A TAPER. ***
 *
 * "Se il reddito imponibile non supera 23.000 €, a Milano l'addizionale non
 *  e' dovuta. Superata la soglia, l'addizionale e' dovuta sull'intero
 *  imponibile."
 *
 * So at 23,000 the employee owes nothing, and at 23,000.01 they owe 0.80% of
 * the WHOLE imponibile (~€184) — not 0.80% of the excess. Net pay genuinely
 * falls as gross rises across this point. It looks like a bug and it is not.
 * Do not smooth it. See the monotonicity test in payroll.test.ts.
 * Checked 2026-08-08.
 */
export const MILANO_COMUNALE = {
  rate: 0.008,
  exemptionThreshold: 23_000,
} as const;

/* ------------------------------------------------------------------ *
 * TFR — trattamento di fine rapporto
 * ------------------------------------------------------------------ */

/**
 * Accrues at RAL / 13.5, less a 0.50% contribution to the INPS fondo di
 * garanzia. Net effect ~6.91% of RAL. Deferred pay: never part of net.
 */
export const TFR_DIVISOR = 13.5;
export const TFR_FONDO_GARANZIA = 0.005;
