# Simulatore netto — prototipo Jet HR

From RAL (annual gross) to annual and monthly net, with every withholding shown
as its own line. Tax year **2026**.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 24 assertions over the payroll engine
npm run build
```

---

## What it does

Enter a RAL, pick 13 or 14 mensilità, and the screen shows:

- **netto annuo** and **netto mensile**
- a waterfall of where the gross went
- **every deduction as its own row**, including each detrazione as a separate
  credit rather than one lumped "detrazioni" figure
- **TFR** accrued, shown separately as deferred pay
- a contextual warning when the salary sits just above one of the two points
  where net pay actually *falls* as gross rises
- the model's own assumptions, on screen

The brief asked to show all the items withheld at gross. That is the part most
calculators collapse, so it is the part this one opens up.

---

## The calculation chain

Order matters — each step consumes the previous one's output. One function per
step in `lib/payroll.ts`, so the code maps to this diagram line by line.

```
RAL
 (1) − INPS 9,19% (+1% above €56.224)      → imponibile fiscale
 (2)   IRPEF lorda: 23% / 33% / 43%
 (3) − detrazione lavoro dipendente (art. 13 TUIR)
 (4) − ulteriore detrazione €65 (reddito 25k–35k)
 (5) − detrazione cuneo fiscale (reddito 20k–40k)   → IRPEF netta (min 0)
 (6) − addizionale regionale Lombardia (4 scaglioni, 1,23%–1,73%)
 (7) − addizionale comunale Milano (0,80%, esenzione fino a €23.000)
 (8) + bonus cuneo fiscale (reddito ≤ 20k, esente)  → NETTO ANNUO

 TFR ≈ 6,91% della RAL — accrued, never part of net
```

**The second IRPEF bracket is 33%, not 35%.** Legge di Bilancio 2026
(L. 199/2025) cut it by two points effective 1 January 2026. Most published
material and most model training data still say 35%.

### Worked example — RAL €30.000, 13 mensilità

| | |
|---|---:|
| RAL | 30.000,00 € |
| Contributi INPS (9,19%) | − 2.757,00 € |
| Imponibile fiscale | 27.243,00 € |
| IRPEF lorda (23%) | − 6.265,89 € |
| Detrazione lavoro dipendente | + 1.979,29 € |
| Ulteriore detrazione | + 65,00 € |
| Detrazione cuneo fiscale | + 1.000,00 € |
| IRPEF netta | − 3.221,60 € |
| Addizionale regionale | − 377,94 € |
| Addizionale comunale | − 217,94 € |
| **Netto annuo** | **23.425,52 €** |
| **Netto mensile** | **1.802 €** |
| TFR (differito) | 2.072 € |

---

## The four cliffs

Italian payroll contains points where **earning one euro more leaves you with
less**. Four of them fall inside the standard Milan case:

**1. Bonus cuneo fiscale, first tier — €8.500 of imponibile, ≈ €149.**
The exempt supplement is a percentage of the *whole* reddito, not of a slice.
Crossing €8.500 re-prices everything from 7,1% to 5,3%. RAL ≈ €9.365.

**2. Trattamento integrativo — €15.000 of imponibile, ≈ €127.**
The full €1.200 stops at €15.000; above it the capienza test applies and a
standard employee gets nothing. The art. 13 detrazione steps *up* at the same
point (worth ~€1.070), so this crossing used to read as a large gain — adding
the TI turned it into a net loss. RAL ≈ €16.520.

**3. Addizionale comunale di Milano — €23.000 of imponibile, ≈ €181.**
0,80% with an exemption up to €23.000. Above the threshold the rate applies to
the *entire* imponibile, not to the excess. RAL ≈ €25.330.

**4. Ulteriore detrazione di €65 — €35.000 of imponibile, €63.**
A flat credit over a closed range, so it does not taper — it vanishes.
RAL ≈ €38.545.

All four are real rules, not modelling artefacts. They are marked as cliffs in
`lib/rates2026.ts`; **do not smooth them**. The result would look nicer and be
wrong.

Each one was found by a different mechanism, which is the point:

- The **Milano** cliff came out of primary-source research during planning.
- The **€65** cliff was found by the monotonicity sweep on its first run.
- The **€8.500** cliff was *missed* by that sweep — it started at RAL €10.000
  (above the cliff) and stepped by €100 (coarse enough that the gross gain
  masked the drop). Code review caught it. The sweep now starts at €5.000 with
  a €25 step, and both properties are asserted rather than trusted.
- The **€15.000** cliff did not exist until the trattamento integrativo was
  implemented, which happened because a cross-check against a public calculator
  showed a 5,8% divergence at RAL €30.000 (see *Validation*).

---

## Tests

`npm test` — 24 assertions in `lib/payroll.test.ts`.

The most valuable one sweeps RAL from €5k to €100k in €25 steps and asserts net
never falls **except at exactly those four thresholds, by exactly those
amounts**. Written that way on purpose: a naive "net always rises" assertion
fails on correct code and tempts the next person into deleting a real tax rule.

Two properties of the sweep are load-bearing and easy to get wrong: it must
**start below the lowest cliff**, and its **step must be smaller than the
smallest cliff** — otherwise the gross gain across a step hides the drop. The
first version failed both and silently missed a real cliff.

Other vectors cover the €30k golden case line by line, the no-tax area at
€8.500, the 33% bracket at €40k, all three brackets plus the 1% INPS surcharge
at €60k, the bonus cuneo below €20k, zero, and invalid input.

Cliff magnitudes are probed at ±0,005 of RAL. A coarser probe moves gross by a
whole euro, which hands ~€0,60 of net back and understates the cliff.

---

## Validation

Cross-checked against `calcolastipendionetto.it` (Lombardia, 13 mensilità, no
dependants) by driving it with Playwright.

| RAL | theirs | ours | delta | % |
|---|---|---|---|---|
| 15.000 | 13.621,50 | 14.197,95 | +576,45 | +4,23% |
| 20.000 | 18.162,00 | 17.432,61 | −729,39 | −4,02% |
| 25.000 | 21.724,50 | 20.569,65 | −1.154,85 | −5,32% |
| 30.000 | 24.789,00 | 23.425,52 | −1.363,48 | −5,50% |
| 45.000 | 30.279,50 | 30.034,26 | −245,24 | −0,81% |
| 60.000 | 37.902,00 | 37.554,66 | −347,34 | −0,92% |

**Above the exempt-sum bands the two agree within 1%, and the residual is
entirely the comune.** Our Milano addizionale comunale is €326,92 at RAL 45.000
and €435,59 at 60.000; the gaps are €245,24 and €347,34, leaving €81,68 and
€88,25 — their region-only default comunale. Every other line reconciles to the
cent, which independently validates INPS, all three IRPEF brackets, the
detrazione tapers and the four regional bands.

**Their low end does not hold up.** At RAL 15.000 they return €13.621,50, which
is exactly 15.000 × 0,9081 — the imponibile fiscale. Same shape at 20.000
(€18.162,00). They are printing gross-minus-INPS as the net: no IRPEF, no
exempt sums. At 15.000 the tax is genuinely not fully absorbed (€3.132,95 lorda
against a €1.955 detrazione), so that number cannot be right.

The middle band is where the interesting disagreement was. At RAL €30.000 the
5,5% gap turned out to be both tools wrong in different directions:

- **Their side:** the calculator pays the full €1.200 trattamento integrativo
  across the whole 15k–28k band by default. The rule only pays to the extent
  detrazioni exceed the gross tax; at this income they do not, so nothing is
  due. Their own page concedes the condition is *"non verificabile dal
  calcolatore"*. They also cannot apply Milan's addizionale comunale, because
  they ask for a region but not a comune.
- **Our side:** the trattamento integrativo was not modelled at all, written
  off as superseded. It is not. At RAL €15.000 it pays €1.200 and this tool was
  understating net by exactly that.

Implementing it with its capienza condition left the €30.000 figure unchanged
(it is genuinely zero there), corrected everything below ~€16.500, and created
the fourth cliff documented above.

**Takeaway:** a public calculator is a weaker oracle than the legislation. Use
it to find *divergences worth investigating*, then resolve them against the
primary source — never adopt its number because it disagrees. Here the sweep
across six incomes was worth far more than any single comparison: the tight
agreement at the top validated the core engine, and the pattern at the bottom
identified which tool was wrong.

## Assumptions and simplifications

Deliberate, and stated on screen as well as here.

**Persona:** impiegato, tempo indeterminato, full year, resident in Milano, no
dependants, no special regimes.

- A projection for illustration. Not a payslip, not tax advice.
- INPS at the standard 9,19% — no sector or firm-size variation, no massimale.
- Addizionali treated as current-year. In reality they are computed on the
  prior year's income and settled the following year via saldo and acconto.
- Monthly net is annual ÷ mensilità. Detrazioni are spread over the 12 ordinary
  months only, so a real tredicesima is taxed at close to the full rate and
  December's net is *lower* than the flat figure suggests. The annual total is
  right; the monthly split is smoothed.
- Previdenza complementare not modelled — deductible, would raise net.
- Detrazioni not pro-rated by days worked. For a full year the factor is
  365/365, so it is a no-op here, but not for a mid-year hire.
- No rounding to the euro. Real payroll rounds; figures here will not match a
  cedolino to the last cent.
- Trattamento integrativo **is** modelled, capienza condition included. Its
  15k–28k formula uses the art. 13 detrazione only; other detrazioni that can
  enter it (spese mediche, bonus edilizi) are out of scope for this persona,
  which is the one case where our figure could understate net
- Not modelled: conguaglio di fine anno, the €440
  reduction above €200.000, fringe benefits, welfare, buoni pasto, straordinari,
  premi di risultato.
- TFR shown as gross accrual; tassazione separata at liquidation is out of scope.

---

## Design

The UI replicates the **Jet HR product interface**, not the marketing site.
The two differ: the product is white, uses ~8px controls, hairline-divided
label/value rows, no dark sections, and lime only as a small accent. The
marketing site is cream with pill buttons and dark contrast blocks.

The prototype presents as a new in-product screen —
`Personale › Simulatore netto` — sibling to the `Costo assunzione` tool that
already exists in the sidebar. The sidebar in `app/shell.tsx` is deliberately
static chrome; it exists only to put the calculator in the right frame.

Tokens live in `app/globals.css`, sampled from product screenshots, overriding
shadcn's defaults (which are dark mode + Geist + zinc — the opposite of this
product). No component contains a raw hex value.

---

## Where this would go next

Jet HR already publishes a calculator at `jethr.com/strumenti/calcolo-irpef`.
It takes more inputs than this one (comune, dependants, previdenza
complementare) and shows fewer output lines. Its input list is the roadmap:

1. **Comune + regione selectors.** The rate tables are already shaped for it,
   and the cliff generalises — around 870 Lombard comuni set their own
   exemption threshold.
2. **Familiari a carico** — slots into the detrazioni list as more credits.
3. **Previdenza complementare** — one more subtraction before step (2).
4. **Costo azienda** — employer INPS, INAIL, TFR. The employer side already
   exists as a product surface; both could share this engine.
5. **Month-by-month view** — the honest fix for the tredicesima distortion.
6. **Net → gross inversion** — binary search over `calcNet`, ~10 lines. Useful
   for salary ranges under the EU Pay Transparency Directive.

---

## Sources

Rates carry their source and check date in `lib/rates2026.ts`.

- IRPEF 2026 brackets — Legge di Bilancio 2026 (L. 199/2025, art. 1 co. 3)
- Detrazioni — art. 13 TUIR, confirmed unchanged for 2026
- INPS 1% threshold €56.224 and massimale €122.295 — INPS circ. n. 6/2026
- Addizionale regionale Lombardia — 4 scaglioni, 1,23%–1,73%
- Addizionale comunale Milano — 0,80%, esenzione €23.000

All checked 2026-08-08.
