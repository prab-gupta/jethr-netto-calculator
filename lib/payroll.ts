/**
 * RAL -> netto, for the standard case.
 *
 * Persona (fixed): impiegato, tempo indeterminato, resident in Milano,
 * no dependants, no special regimes, full year worked.
 *
 * The chain, in order — each step consumes the previous one's output:
 *
 *   RAL
 *    (1) - INPS contributions                    -> imponibile fiscale
 *    (2) IRPEF lorda over three brackets
 *    (3) - detrazione lavoro dipendente
 *    (4) - ulteriore detrazione 65
 *    (5) - detrazione cuneo fiscale              -> IRPEF netta
 *    (6) - addizionale regionale Lombardia
 *    (7) - addizionale comunale Milano
 *    (8) + bonus cuneo (exempt cash)             -> netto annuo
 *
 * No rounding happens in here. Eight sequential steps compound rounding
 * error fast; the presentation layer rounds once, at the end.
 */

import {
  BONUS_CUNEO_TIERS,
  Bracket,
  DETRAZIONE_CUNEO,
  DETRAZIONE_LAVORO,
  DETRAZIONE_ULTERIORE_65,
  INPS_EXTRA_RATE,
  INPS_EXTRA_THRESHOLD,
  INPS_RATE,
  IRPEF_BRACKETS,
  LOMBARDIA_BRACKETS,
  MILANO_COMUNALE,
  TFR_DIVISOR,
  TFR_FONDO_GARANZIA,
} from "./rates2026";

export type Mensilita = 13 | 14;

export type PayrollBreakdown = {
  ral: number;
  inps: number;
  imponibileFiscale: number;
  irpefLorda: number;
  detrazioni: {
    lavoroDipendente: number;
    ulteriore65: number;
    cuneo: number;
    total: number;
  };
  irpefNetta: number;
  addizionaleRegionale: number;
  addizionaleComunale: number;
  bonusCuneo: number;
  totalTrattenute: number;
  nettoAnnuo: number;
  nettoMensile: number;
  mensilita: Mensilita;
  /** Deferred pay. Accrued, but NOT included in nettoAnnuo. */
  tfrAnnuo: number;
  /** totalTrattenute / ral */
  aliquotaEffettiva: number;
};

/**
 * Walk a progressive bracket table, taxing each slice at its own rate.
 * Used for both IRPEF and the addizionale regionale — same shape, different
 * tables. (Deliberately not used for the addizionale comunale, which is a
 * cliff rather than a progression.)
 */
function applyBrackets(amount: number, brackets: Bracket[]): number {
  let tax = 0;
  let floor = 0;
  for (const { upTo, rate } of brackets) {
    if (amount <= floor) break;
    const slice = Math.min(amount, upTo) - floor;
    tax += slice * rate;
    floor = upTo;
  }
  return tax;
}

/** (1) Employee INPS, with the extra 1% on the portion above the first bracket. */
function calcInps(ral: number): number {
  const base = ral * INPS_RATE;
  const excess = Math.max(0, ral - INPS_EXTRA_THRESHOLD);
  return base + excess * INPS_EXTRA_RATE;
}

/** (2) IRPEF lorda. */
function calcIrpefLorda(imponibile: number): number {
  return applyBrackets(imponibile, IRPEF_BRACKETS);
}

/** (3) Detrazione per lavoro dipendente — art. 13 TUIR. Tapers to zero at 50k. */
function calcDetrazioneLavoro(reddito: number): number {
  const d = DETRAZIONE_LAVORO;
  if (reddito <= 0) return 0;
  if (reddito <= d.flatUpTo) return d.flatAmount;
  if (reddito <= d.midTo) {
    return d.midBase + (d.midVariable * (d.midTo - reddito)) / d.midSpan;
  }
  if (reddito <= d.highTo) {
    return (d.highBase * (d.highTo - reddito)) / d.highSpan;
  }
  return 0;
}

/** (4) Flat 65 for reddito between 25k and 35k. */
function calcDetrazioneUlteriore(reddito: number): number {
  const d = DETRAZIONE_ULTERIORE_65;
  return reddito > d.from && reddito <= d.to ? d.amount : 0;
}

/** (5) Cuneo fiscale detrazione: flat 1,000 to 32k, then tapering to zero at 40k. */
function calcDetrazioneCuneo(reddito: number): number {
  const d = DETRAZIONE_CUNEO;
  if (reddito <= d.from || reddito > d.taperTo) return 0;
  if (reddito <= d.flatTo) return d.amount;
  return (d.amount * (d.taperTo - reddito)) / d.taperSpan;
}

/** (6) Addizionale regionale Lombardia — progressive, its own bracket table. */
function calcAddizionaleRegionale(imponibile: number): number {
  return applyBrackets(imponibile, LOMBARDIA_BRACKETS);
}

/**
 * (7) Addizionale comunale Milano — a CLIFF.
 *
 * At or below the threshold: nothing. Above it: 0.80% of the entire
 * imponibile, not of the excess. This makes net pay fall as gross rises
 * across the boundary. That is the actual rule — see rates2026.ts.
 */
function calcAddizionaleComunale(imponibile: number): number {
  const { rate, exemptionThreshold } = MILANO_COMUNALE;
  if (imponibile <= exemptionThreshold) return 0;
  return imponibile * rate;
}

/** (8) Exempt cash supplement for reddito <= 20k. Added to net, not a detrazione. */
function calcBonusCuneo(reddito: number): number {
  if (reddito <= 0) return 0;
  for (const { upTo, rate } of BONUS_CUNEO_TIERS) {
    if (reddito <= upTo) return reddito * rate;
  }
  return 0;
}

/** TFR accrual. Deferred pay — returned separately, never folded into net. */
function calcTfr(ral: number): number {
  return ral / TFR_DIVISOR - ral * TFR_FONDO_GARANZIA;
}

export function calcNet(ral: number, mensilita: Mensilita = 13): PayrollBreakdown {
  if (!Number.isFinite(ral) || ral < 0) {
    throw new RangeError(`RAL must be a non-negative finite number, got ${ral}`);
  }

  const inps = calcInps(ral);
  const imponibileFiscale = ral - inps;

  const irpefLorda = calcIrpefLorda(imponibileFiscale);

  const lavoroDipendente = calcDetrazioneLavoro(imponibileFiscale);
  const ulteriore65 = calcDetrazioneUlteriore(imponibileFiscale);
  const cuneo = calcDetrazioneCuneo(imponibileFiscale);
  const detrazioniTotal = lavoroDipendente + ulteriore65 + cuneo;

  // Detrazioni cannot produce a refund — capped at the tax due.
  const irpefNetta = Math.max(0, irpefLorda - detrazioniTotal);

  const addizionaleRegionale = calcAddizionaleRegionale(imponibileFiscale);
  const addizionaleComunale = calcAddizionaleComunale(imponibileFiscale);

  const bonusCuneo = calcBonusCuneo(imponibileFiscale);

  const totalTrattenute =
    inps + irpefNetta + addizionaleRegionale + addizionaleComunale;
  const nettoAnnuo = ral - totalTrattenute + bonusCuneo;

  return {
    ral,
    inps,
    imponibileFiscale,
    irpefLorda,
    detrazioni: { lavoroDipendente, ulteriore65, cuneo, total: detrazioniTotal },
    irpefNetta,
    addizionaleRegionale,
    addizionaleComunale,
    bonusCuneo,
    totalTrattenute,
    nettoAnnuo,
    nettoMensile: nettoAnnuo / mensilita,
    mensilita,
    tfrAnnuo: calcTfr(ral),
    aliquotaEffettiva: ral > 0 ? totalTrattenute / ral : 0,
  };
}
