/**
 * OlympusPanel
 *
 * Themed card / panel shell for the Olympus Night design system.
 * Purely presentational — wraps children with styled borders and backgrounds.
 *
 * Variants:
 *   "dark"   — standard deep-slate card (equivalent to the existing bg-slate-900 style)
 *   "marble" — frosted dark glass with a warm marble-gold border
 *   "gold"   — strong gold border with ambient glow
 *   "glass"  — ultra-thin translucent dark glass
 *   "inset"  — a recessed inner-panel, typically used nested inside another panel
 *
 * Usage:
 *   <OlympusPanel variant="marble" className="p-6">
 *     ...
 *   </OlympusPanel>
 *
 * No logic, no hooks — server-component safe.
 */

import type { ElementType, ReactNode } from "react";

export type OlympusPanelVariant = "dark" | "marble" | "gold" | "glass" | "inset";

export type OlympusPanelProps = {
  children: ReactNode;
  /** Visual style of the panel surface */
  variant?: OlympusPanelVariant;
  /** Outer HTML element (default: "div") */
  as?: ElementType;
  /** Rounding size — default "3xl" matches the existing design */
  rounded?: "xl" | "2xl" | "3xl";
  /** Extra className (use for padding, margin, grid placement, etc.) */
  className?: string;
};

const VARIANT_CLASSES: Record<OlympusPanelVariant, string> = {
  dark: [
    "border border-white/10",
    "bg-slate-900",
    "shadow-xl shadow-slate-950/40",
  ].join(" "),

  marble: [
    "oly-panel-marble",                  // defined in globals.css
    "shadow-xl shadow-slate-950/50",
  ].join(" "),

  gold: [
    "oly-border-gold",                   // defined in globals.css
    "bg-slate-950/85",
    "shadow-xl shadow-slate-950/50",
    "backdrop-blur-sm",
  ].join(" "),

  glass: [
    "oly-panel-glass",                   // defined in globals.css
    "shadow-xl shadow-slate-950/50",
  ].join(" "),

  inset: [
    "border border-white/8",
    "bg-slate-950/60",
    "shadow-inner",
  ].join(" "),
};

const ROUNDED_CLASSES: Record<NonNullable<OlympusPanelProps["rounded"]>, string> = {
  xl:  "rounded-xl",
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
};

export function OlympusPanel({
  children,
  as: Tag = "div",
  variant = "dark",
  rounded = "3xl",
  className = "",
}: OlympusPanelProps) {
  return (
    <Tag className={`${ROUNDED_CLASSES[rounded]} ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </Tag>
  );
}
