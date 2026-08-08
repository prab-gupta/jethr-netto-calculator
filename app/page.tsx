"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Info, PiggyBank } from "lucide-react";
import {
  GroupLabel,
  InfoHint,
  LabelRow,
  SectionBand,
  WaterfallBar,
  eur,
  eurCents,
} from "@/components/rows";
import { calcNet, type Mensilita } from "@/lib/payroll";
import {
  BONUS_CUNEO_TIERS,
  DETRAZIONE_ULTERIORE_65,
  MILANO_COMUNALE,
  TAX_YEAR,
  TRATTAMENTO_INTEGRATIVO,
} from "@/lib/rates2026";

const pct = (n: number) => `${(n * 100).toFixed(2).replace(".", ",")}%`;

/**
 * The three points where net pay genuinely falls as gross rises. All are real
 * rules, not modelling artefacts — see lib/rates2026.ts. We warn when the
 * user lands just above one, because it is the most actionable thing this
 * screen knows and no other calculator surfaces it.
 *
 * The copy states the RULE and never quotes a euro figure. An earlier version
 * computed "circa X €" from the rate constants, which produced a number that
 * contradicted the actual figure in the breakdown table two inches below it
 * (the constants price the threshold, the table prices the user's reddito).
 * The real amounts are already on screen; the banner explains why they moved.
 */
const CLIFF_WINDOW = 1_500;

const CLIFFS = [
  {
    threshold: BONUS_CUNEO_TIERS[0].upTo,
    title: "Prima fascia del bonus cuneo fiscale superata",
    body: `Fino a ${eur(BONUS_CUNEO_TIERS[0].upTo)} di reddito la somma esente è il 7,1%; oltre, scende al 5,3%. La percentuale si applica all'intero reddito, non solo alla parte eccedente, quindi il bonus in busta cala di colpo.`,
  },
  {
    threshold: TRATTAMENTO_INTEGRATIVO.fullUpTo,
    title: "Trattamento integrativo non più spettante per intero",
    body: `Fino a ${eur(TRATTAMENTO_INTEGRATIVO.fullUpTo)} di reddito il trattamento integrativo spetta per intero. Oltre, spetta solo per la parte in cui le detrazioni superano l'IRPEF lorda: per un dipendente standard, quasi sempre nulla.`,
  },
  {
    threshold: MILANO_COMUNALE.exemptionThreshold,
    title: "Soglia di esenzione dell'addizionale comunale superata",
    body: `Fino a ${eur(MILANO_COMUNALE.exemptionThreshold)} di imponibile l'addizionale comunale di Milano non è dovuta. Superata la soglia, lo 0,80% si applica all'intero imponibile e non solo alla parte eccedente.`,
  },
  {
    threshold: DETRAZIONE_ULTERIORE_65.to,
    title: "Ulteriore detrazione di 65 € non più spettante",
    body: `L'ulteriore detrazione di ${eur(DETRAZIONE_ULTERIORE_65.amount)} spetta solo fino a ${eur(DETRAZIONE_ULTERIORE_65.to)} di imponibile. È un importo fisso, quindi si perde per intero appena superata la soglia.`,
  },
];

/** `max` on a number input is advisory — paste bypasses it. Clamp for real. */
const RAL_MAX = 1_000_000;

export default function Page() {
  // Keep the raw string so the field can be cleared while typing. Deriving the
  // number on render instead of storing it avoids the "045000" the old
  // snap-to-0 onChange produced, and clamps pasted values like 1e308 that the
  // HTML max attribute does not enforce.
  const [raw, setRaw] = useState("30000");
  const [mensilita, setMensilita] = useState<Mensilita>(13);

  const ral = Math.min(RAL_MAX, Math.max(0, Number(raw) || 0));
  const r = useMemo(() => calcNet(ral, mensilita), [ral, mensilita]);

  const activeCliffs = CLIFFS.filter(
    (c) =>
      r.imponibileFiscale > c.threshold &&
      r.imponibileFiscale <= c.threshold + CLIFF_WINDOW,
  );

  // The bar decomposes the RAL. Exempt sums (bonus cuneo, trattamento
  // integrativo) are paid on top of it, not carved out of it, so the Netto
  // segment nets them out to keep the segments summing to exactly the RAL —
  // and the label says so when any are in play.
  const esenti = r.bonusCuneo + r.trattamentoIntegrativo;
  const segments = [
    {
      label: esenti > 0 ? "Netto (escluse somme esenti)" : "Netto",
      amount: r.nettoAnnuo - esenti,
      className: "bg-accent",
    },
    { label: "Contributi INPS", amount: r.inps, className: "bg-neutral-800" },
    { label: "IRPEF", amount: r.irpefNetta, className: "bg-neutral-500" },
    {
      label: "Addizionali",
      amount: r.addizionaleRegionale + r.addizionaleComunale,
      className: "bg-neutral-300",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="grain relative overflow-hidden bg-[#0f0f0e] px-5 py-9 sm:px-10">
        <div className="relative z-10 mx-auto max-w-[1100px]">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-bold tracking-[-0.01em] text-white">
              Simulatore netto
            </h1>
            <span className="rounded-full border border-white/25 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-white/70">
              Regole fiscali {TAX_YEAR}
            </span>
          </div>
          <p className="mt-2 text-[15px] text-white/60">
            Dalla RAL al netto in busta paga, con il dettaglio di ogni trattenuta.
          </p>
        </div>
      </header>

      <main className="overflow-x-hidden px-5 py-8 sm:px-10">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-6 flex items-start gap-2.5 rounded-lg bg-info px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
            <p className="text-[14px] leading-snug">
              Stima indicativa per un impiegato a tempo indeterminato residente
              a Milano, senza familiari a carico né agevolazioni. Non sostituisce
              il cedolino.
            </p>
          </div>

          {/* ---- Inputs ---- */}
          {/* Results update live as the inputs change. The Calcola button is
              kept because the brief asks for it and because it is the real
              submit affordance — Enter and the on-screen button both fire it,
              which on mobile is what dismisses the numeric keypad. It has
              nothing left to compute, so it only needs to not reload. */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="mb-6 overflow-hidden rounded-xl border border-border"
          >
            <SectionBand>Dati di partenza</SectionBand>

            <div className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-4">
              <label
                htmlFor="ral"
                className="flex flex-1 items-center gap-1.5 text-[15px] text-muted-foreground"
              >
                Retribuzione annua lorda (RAL)
                <InfoHint text="Il totale lordo annuo previsto dal contratto, comprensivo di tredicesima ed eventuale quattordicesima." />
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="ral"
                  type="number"
                  min={0}
                  max={RAL_MAX}
                  step={500}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  className="tnum h-11 w-48 rounded-lg border border-input bg-background px-3 text-right text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="text-[15px] text-muted-foreground">€</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-4">
              <span
                id="mensilita-label"
                className="flex flex-1 items-center gap-1.5 text-[15px] text-muted-foreground"
              >
                Mensilità
                <InfoHint text="La RAL viene distribuita su 13 mensilità (CCNL Commercio) o 14 (es. Metalmeccanici). Il netto annuo non cambia: cambia solo l'importo di ciascuna mensilità." />
              </span>
              <div
                role="radiogroup"
                aria-labelledby="mensilita-label"
                className="flex rounded-lg bg-muted p-1"
              >
                {([13, 14] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mensilita === m}
                    onClick={() => setMensilita(m)}
                    className={
                      mensilita === m
                        ? "tnum rounded-md border border-border bg-background px-6 py-1.5 text-[14px] font-semibold shadow-sm"
                        : "tnum rounded-md px-6 py-1.5 text-[14px] text-muted-foreground"
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 px-6 py-4">
              <span className="flex flex-1 items-center gap-1.5 text-[15px] text-muted-foreground">
                Sede di riferimento
                <InfoHint text="Il prototipo è limitato a Milano: le addizionali regionali e comunali sono deliberate localmente, quindi ogni comune richiede la propria tabella." />
              </span>
              <select
                disabled
                aria-label="Sede di riferimento"
                className="h-11 w-48 cursor-not-allowed rounded-lg border border-input bg-muted px-3 text-[15px] text-muted-foreground"
              >
                <option>Milano (Lombardia)</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border bg-muted/40 px-6 py-4">
              <span className="text-[13px] text-muted-foreground">
                I risultati si aggiornano mentre digiti.
              </span>
              <button
                type="submit"
                className="rounded-lg bg-primary px-7 py-2.5 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Calcola
              </button>
            </div>
          </form>

          {/* ---- Result ---- */}
          <section className="mb-6 overflow-hidden rounded-xl border border-border">
            <SectionBand>Risultato</SectionBand>

            <div className="grid gap-6 px-6 py-6 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[14px] text-muted-foreground">
                  Netto annuo
                </p>
                <p className="tnum inline-block rounded-md bg-accent px-2 py-0.5 text-[40px] font-bold leading-tight text-accent-foreground">
                  {eur(r.nettoAnnuo)}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[14px] text-muted-foreground">
                  Netto mensile{" "}
                  <span className="tnum">(su {mensilita} mensilità)</span>
                </p>
                <p className="tnum text-[40px] font-bold leading-tight">
                  {eur(r.nettoMensile)}
                </p>
              </div>
            </div>

            <div className="border-t border-border px-6 py-5">
              <WaterfallBar segments={segments} />
            </div>

            <LabelRow
              label="Aliquota effettiva sulla RAL"
              hint="Totale di contributi, IRPEF netta e addizionali diviso la RAL."
              value={pct(r.aliquotaEffettiva)}
              last
            />
          </section>

          {/* ---- Cliff warnings ---- */}
          {activeCliffs.map((c) => (
            <div
              key={c.threshold}
              className="mb-6 flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning-soft px-4 py-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="text-[14px] font-semibold">{c.title}</p>
                <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">
                  {c.body}
                </p>
              </div>
            </div>
          ))}

          {/* ---- Breakdown ---- */}
          <section className="mb-6 overflow-hidden rounded-xl border border-border">
            <SectionBand>Dettaglio trattenute</SectionBand>

            <LabelRow
              label="Retribuzione annua lorda"
              value={eurCents(r.ral)}
              strong
            />

            <GroupLabel>Contributi</GroupLabel>
            <LabelRow
              label="Contributi INPS a carico del dipendente"
              hint="Aliquota IVS del 9,19%, più un ulteriore 1% sulla quota di retribuzione oltre la prima fascia pensionabile. Sono interamente deducibili: si sottraggono prima di calcolare l'IRPEF."
              value={`− ${eurCents(r.inps)}`}
              share={`${pct(r.inps / r.ral || 0)} della RAL`}
            />
            <LabelRow
              label="Imponibile fiscale"
              value={eurCents(r.imponibileFiscale)}
              strong
            />

            <GroupLabel>IRPEF</GroupLabel>
            <LabelRow
              label="IRPEF lorda"
              hint={`Scaglioni ${TAX_YEAR}: 23% fino a 28.000 €, 33% da 28.000 a 50.000 €, 43% oltre. Ogni scaglione è tassato alla propria aliquota.`}
              value={`− ${eurCents(r.irpefLorda)}`}
              share={`${pct(r.irpefLorda / r.ral || 0)} della RAL`}
            />
            <LabelRow
              indent
              tone="credit"
              label="Detrazione per lavoro dipendente"
              hint="Art. 13 TUIR. Non riduce il reddito ma l'imposta. Decresce all'aumentare del reddito e si azzera a 50.000 €."
              value={`+ ${eurCents(r.detrazioni.lavoroDipendente)}`}
            />
            <LabelRow
              indent
              tone="credit"
              label="Ulteriore detrazione"
              hint={`Importo fisso di 65 € per redditi tra 25.000 e 35.000 €. Non è graduale: sopra i 35.000 € si perde per intero.`}
              value={`+ ${eurCents(r.detrazioni.ulteriore65)}`}
            />
            <LabelRow
              indent
              tone="credit"
              label="Detrazione cuneo fiscale"
              hint="Fino a 1.000 € per redditi tra 20.000 e 32.000 €, poi decresce fino ad azzerarsi a 40.000 €."
              value={`+ ${eurCents(r.detrazioni.cuneo)}`}
            />
            {/* Without this row the block visibly fails to add up: lorda minus
                credits goes negative, IRPEF netta clamps to zero, and the
                difference disappears with no explanation on screen. */}
            {r.detrazioni.total > r.irpefLorda ? (
              <LabelRow
                indent
                label="Detrazioni eccedenti l'imposta (non fruibili)"
                hint="Le detrazioni non generano un rimborso: la parte che supera l'IRPEF lorda si perde. È il motivo per cui l'IRPEF netta si ferma a zero invece di diventare negativa."
                value={`− ${eurCents(r.detrazioni.total - r.irpefLorda)}`}
              />
            ) : null}
            <LabelRow
              label="IRPEF netta"
              hint="IRPEF lorda meno le detrazioni spettanti. Non può scendere sotto zero: le detrazioni non generano un rimborso."
              value={`− ${eurCents(r.irpefNetta)}`}
              share={`${pct(r.irpefNetta / r.ral || 0)} della RAL`}
              strong
            />

            <GroupLabel>Addizionali</GroupLabel>
            <LabelRow
              label="Addizionale regionale (Lombardia)"
              hint="A scaglioni dall'1,23% all'1,73%, calcolata sull'imponibile fiscale. Gli scaglioni regionali non coincidono con quelli IRPEF."
              value={`− ${eurCents(r.addizionaleRegionale)}`}
              share={`${pct(r.addizionaleRegionale / r.ral || 0)} della RAL`}
            />
            <LabelRow
              label="Addizionale comunale (Milano)"
              hint="0,80% con esenzione fino a 23.000 € di imponibile. Superata la soglia si applica all'intero imponibile, non solo alla parte eccedente."
              value={`− ${eurCents(r.addizionaleComunale)}`}
              share={`${pct(r.addizionaleComunale / r.ral || 0)} della RAL`}
            />

            {r.bonusCuneo > 0 || r.trattamentoIntegrativo > 0 ? (
              <>
                <GroupLabel>Somme esenti</GroupLabel>
                {r.bonusCuneo > 0 ? (
                  <LabelRow
                    tone="credit"
                    label="Bonus cuneo fiscale"
                    hint="Somma esente per redditi fino a 20.000 €: dal 7,1% al 4,8% del reddito da lavoro dipendente. Non è tassata e si aggiunge direttamente al netto."
                    value={`+ ${eurCents(r.bonusCuneo)}`}
                  />
                ) : null}
                {r.trattamentoIntegrativo > 0 ? (
                  <LabelRow
                    tone="credit"
                    label="Trattamento integrativo"
                    hint="1.200 € per redditi fino a 15.000 €. Tra 15.000 e 28.000 spetta solo per la parte in cui le detrazioni superano l'IRPEF lorda, quindi per un dipendente standard di norma non spetta."
                    value={`+ ${eurCents(r.trattamentoIntegrativo)}`}
                  />
                ) : null}
              </>
            ) : null}

            <div className="border-t-2 border-foreground/10">
              <LabelRow
                label="Totale trattenute"
                value={`− ${eurCents(r.totalTrattenute)}`}
                share={`${pct(r.aliquotaEffettiva)} della RAL`}
                strong
              />
              {/* Without this row the totals do not reconcile on screen:
                  RAL minus trattenute is not the net whenever exempt sums
                  are paid on top. */}
              {esenti > 0 ? (
                <LabelRow
                  tone="credit"
                  label="Totale somme esenti"
                  hint="Bonus cuneo fiscale e trattamento integrativo. Non sono tassati e si sommano al netto, quindi il netto è superiore alla RAL meno le trattenute."
                  value={`+ ${eurCents(esenti)}`}
                  strong
                />
              ) : null}
              <LabelRow
                label="Netto annuo"
                value={eurCents(r.nettoAnnuo)}
                strong
                last
              />
            </div>
          </section>

          {/* ---- TFR ---- */}
          <section className="mb-6 overflow-hidden rounded-xl border border-border">
            <SectionBand>Retribuzione differita</SectionBand>
            <div className="flex items-start gap-4 px-6 py-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                <PiggyBank className="h-4 w-4 text-accent-deep" />
              </span>
              <div className="flex-1">
                <p className="text-[15px] font-semibold">
                  TFR maturato nell&apos;anno
                </p>
                <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">
                  Circa il 6,91% della RAL, accantonato e liquidato alla
                  cessazione del rapporto.{" "}
                  <strong className="font-semibold text-foreground">
                    Non è incluso nel netto indicato sopra.
                  </strong>
                </p>
              </div>
              <span className="tnum text-[20px] font-semibold">
                {eur(r.tfrAnnuo)}
              </span>
            </div>
          </section>

          {/* ---- Assumptions ---- */}
          <section className="mb-10 overflow-hidden rounded-xl border border-border">
            <SectionBand>Ipotesi e semplificazioni</SectionBand>
            <details className="group">
              <summary className="cursor-pointer list-none px-6 py-4 text-[14px] text-muted-foreground marker:hidden hover:text-foreground">
                Cosa è incluso nel modello e cosa no — apri per i dettagli
              </summary>
              <ul className="space-y-2 border-t border-border px-6 py-4 text-[14px] leading-snug text-muted-foreground">
                {[
                  "Stima a scopo illustrativo, non un cedolino e non una consulenza fiscale.",
                  "Impiegato a tempo indeterminato, anno intero, residente a Milano, senza familiari a carico e senza regimi agevolati.",
                  "Contributi INPS all'aliquota standard del 9,19%: nessuna variazione settoriale, nessun massimale contributivo.",
                  "Le addizionali sono trattate come dell'anno corrente. Nella realtà si calcolano sul reddito dell'anno precedente e si versano l'anno successivo tra saldo e acconto.",
                  "Il netto mensile è il netto annuo diviso le mensilità. Le detrazioni spettano solo sulle 12 mensilità ordinarie, quindi la tredicesima è tassata quasi per intero e a dicembre il netto reale è più basso.",
                  "Previdenza complementare non considerata: i contributi a un fondo pensione sono deducibili e aumenterebbero il netto.",
                  "Le detrazioni non sono rapportate ai giorni di lavoro: per un anno intero il fattore è 365/365, ma non vale per chi è assunto in corso d'anno.",
                  "Nessun arrotondamento all'euro: la busta paga arrotonda, quindi le ultime cifre possono differire.",
                  "Non modellati: conguaglio di fine anno, trattamento integrativo, fringe benefit, welfare, buoni pasto, straordinari e premi di risultato.",
                ].map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden className="text-border">
                      —
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </div>
      </main>

      <footer className="grain relative overflow-hidden bg-[#0f0f0e] px-5 py-6 sm:px-10">
        <p className="relative z-10 mx-auto max-w-[1100px] text-[14px] text-white/60">
          Built by{" "}
          <a
            href="https://www.linkedin.com/in/prabhavitgupta"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-white underline-offset-4 hover:underline"
          >
            Prabhavit Gupta
          </a>{" "}
          (
          <a
            href="mailto:prabhavitg@gmail.com"
            className="text-white/80 underline-offset-4 hover:underline"
          >
            prabhavitg@gmail.com
          </a>
          ) for Jet HR
        </p>
      </footer>
    </div>
  );
}
