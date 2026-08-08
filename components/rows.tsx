/**
 * The three presentational pieces shadcn doesn't provide, all lifted from the
 * Jet HR product screenshots:
 *
 *   SectionBand  — the grey header strip ("Rapporto di lavoro")
 *   LabelRow     — label left, value right, hairline between
 *   WaterfallBar — the gross -> net decomposition
 *
 * Everything else on the screen comes from shadcn or stays inline in page.tsx.
 */

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * useGrouping: "always" is deliberate. Italian locale data uses "min2"
 * grouping, so 1802 formats as "1802 €" while 23426 formats as "23.426 €" —
 * which reads as a bug when the two sit next to each other in a money column.
 */
export const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(n);

export const eurCents = (n: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always",
  }).format(n);

export function SectionBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-muted px-6 py-3.5 text-[15px] font-semibold">
      {children}
    </div>
  );
}

/** Small uppercase divider grouping rows inside a card. */
export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-muted/40 px-6 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
      {children}
    </div>
  );
}

export function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={text}
        className="text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground"
      >
        <Info className="h-3.5 w-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-[13px] leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function LabelRow({
  label,
  hint,
  value,
  share,
  indent,
  strong,
  last,
  tone = "default",
}: {
  label: string;
  hint?: string;
  value: string;
  /** e.g. "9,19% della RAL" */
  share?: string;
  indent?: boolean;
  strong?: boolean;
  last?: boolean;
  tone?: "default" | "credit";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-6 py-3.5",
        !last && "border-b border-border",
      )}
    >
      <div className={cn("flex flex-1 items-center gap-1.5", indent && "pl-5")}>
        <span
          className={cn(
            "text-[15px]",
            strong ? "font-semibold text-foreground" : "text-muted-foreground",
            indent && "text-[14px]",
          )}
        >
          {label}
        </span>
        {hint ? <InfoHint text={hint} /> : null}
      </div>
      {share ? (
        <span className="tnum hidden w-36 text-right text-[13px] text-muted-foreground sm:block">
          {share}
        </span>
      ) : null}
      <span
        className={cn(
          "tnum w-32 text-right text-[15px]",
          strong ? "font-semibold" : "font-medium",
          tone === "credit" && "text-accent-deep",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export type WaterfallSegment = {
  label: string;
  amount: number;
  className: string;
};

/**
 * Stacked horizontal bar. The segments already sum to the RAL, so percentage
 * widths are all that's needed — no chart library.
 */
export function WaterfallBar({
  segments,
  total,
}: {
  segments: WaterfallSegment[];
  total: number;
}) {
  const visible = segments.filter((s) => s.amount > 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {visible.map((s) => (
          <div
            key={s.label}
            className={s.className}
            style={{ width: `${(s.amount / total) * 100}%` }}
            title={`${s.label}: ${eur(s.amount)}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {visible.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-full", s.className)} />
            <span className="text-[13px] text-muted-foreground">
              {s.label}{" "}
              <span className="tnum text-foreground">
                {((s.amount / total) * 100).toFixed(1).replace(".", ",")}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
