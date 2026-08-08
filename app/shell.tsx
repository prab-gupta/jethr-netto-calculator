/**
 * Static app chrome — the Jet HR sidebar, reproduced from screenshots.
 *
 * ponytail: decorative only. No routing, no state, no hover menus. It exists
 * so the calculator reads as a screen inside the product rather than a
 * standalone page. Do not wire it up; if real navigation is ever needed,
 * replace this wholesale rather than growing it.
 */

import {
  Banknote,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FileText,
  Folder,
  HeartPulse,
  Home,
  LineChart,
  type LucideIcon,
  Receipt,
  Smartphone,
  Users,
} from "lucide-react";

type NavItem = {
  label: string;
  icon?: LucideIcon;
  expandable?: boolean;
  dot?: boolean;
  children?: { label: string; active?: boolean }[];
};

const NAV: NavItem[] = [
  { label: "Home", icon: Home },
  {
    label: "Personale",
    icon: Users,
    expandable: true,
    children: [
      { label: "Dipendenti" },
      { label: "Professionisti esterni" },
      { label: "Assunzioni e ingaggi" },
      { label: "Variazioni" },
      { label: "Cessazioni" },
      { label: "Costo assunzione" },
      { label: "Simulatore netto", active: true },
    ],
  },
  { label: "Presenze e assenze", icon: CalendarDays, expandable: true },
  { label: "Rimborsi spese", icon: Receipt },
  { label: "Eventi", icon: CalendarDays },
  { label: "Sicurezza e salute", icon: HeartPulse, dot: true },
  { label: "Buoni pasto", icon: Banknote },
  { label: "Cedolini e pagamenti", icon: FileText, expandable: true },
  { label: "Documenti", icon: Folder },
  { label: "Noleggio device", icon: Smartphone },
  { label: "Report", icon: LineChart, expandable: true },
];

const FOOTER_NAV: NavItem[] = [
  { label: "Impostazioni azienda", icon: Building2 },
  { label: "Impara le basi", icon: BookOpen },
];

export function Sidebar() {
  return (
    <aside className="hidden w-[260px] shrink-0 border-r border-border bg-background lg:flex lg:flex-col">
      {/* Org + user block */}
      <div className="px-5 py-5">
        <div className="relative mb-3 h-9 w-11">
          <span className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
            RS
          </span>
          <span className="absolute left-5 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-accent-deep text-[9px] font-bold text-white">
            P
          </span>
        </div>
        <p className="truncate text-[13px] text-muted-foreground">
          Parini, Praga e Benigni SPA …
        </p>
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold">Rusticucci Sandra</p>
          <div className="flex flex-col text-muted-foreground">
            <ChevronUp className="h-3 w-3" />
            <ChevronDown className="-mt-1 h-3 w-3" />
          </div>
        </div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Admin</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((item) => (
          <NavRow key={item.label} item={item} />
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        {FOOTER_NAV.map((item) => (
          <NavRow key={item.label} item={item} />
        ))}
      </div>
    </aside>
  );
}

function NavRow({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] text-foreground">
        {Icon ? (
          <span className="relative">
            <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            {item.dot ? (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive" />
            ) : null}
          </span>
        ) : null}
        <span className="flex-1">{item.label}</span>
        {item.expandable ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : null}
      </div>
      {item.children?.map((child) => (
        <div
          key={child.label}
          className={
            child.active
              ? "rounded-md bg-muted px-2.5 py-2 pl-9 text-[14px] font-semibold text-foreground"
              : "px-2.5 py-2 pl-9 text-[14px] text-muted-foreground"
          }
        >
          {child.label}
        </div>
      ))}
    </div>
  );
}
