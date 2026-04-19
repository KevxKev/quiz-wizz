"use client";

/**
 * OlympusButton
 *
 * Themed button for the Olympus Night design system.
 * Forwards all native <button> props so existing onClick / disabled /
 * type attributes work without any changes to call-site logic.
 *
 * Variants:
 *   "gold"    — primary CTA, gold gradient + glow ("Enter the Feast" style)
 *   "emerald" — standard confirm / start action (matches existing emerald palette)
 *   "cyan"    — secondary action (matches existing cyan palette)
 *   "ghost"   — outlined, transparent background
 *   "danger"  — destructive action (muted rose)
 *
 * Sizes:
 *   "sm"  — compact inline action
 *   "md"  — standard (default)
 *   "lg"  — primary CTA / full-width hero button
 *
 * Usage:
 *   <OlympusButton variant="gold" size="lg" onClick={handleStart} disabled={busy}>
 *     Enter the Feast
 *   </OlympusButton>
 *
 *   <OlympusButton variant="emerald" onClick={handleCreateRoom}>
 *     Create Room
 *   </OlympusButton>
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type OlympusButtonVariant = "gold" | "emerald" | "cyan" | "ghost" | "danger";
export type OlympusButtonSize    = "sm" | "md" | "lg";

export type OlympusButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: OlympusButtonVariant;
  size?: OlympusButtonSize;
  /** Renders a subtle left-aligned label next to full-width buttons */
  loading?: boolean;
  /** Override button children when loading (falls back to children if omitted) */
  loadingLabel?: ReactNode;
};

const VARIANT_CLASSES: Record<OlympusButtonVariant, string> = {
  gold: [
    "oly-btn-gold",                        // background + glow defined in globals.css
    "font-bold text-[#0a0800]",
    "transition-[box-shadow,filter]",
  ].join(" "),

  emerald: [
    "bg-emerald-500 hover:bg-emerald-400",
    "text-slate-950 font-semibold",
    "transition-colors",
    "disabled:bg-slate-700 disabled:text-slate-300",
  ].join(" "),

  cyan: [
    "bg-cyan-500 hover:bg-cyan-400",
    "text-slate-950 font-semibold",
    "transition-colors",
    "disabled:bg-slate-700 disabled:text-slate-300",
  ].join(" "),

  ghost: [
    "border border-white/20 hover:border-white/40",
    "bg-transparent hover:bg-white/5",
    "text-slate-100 font-semibold",
    "transition-colors",
    "disabled:border-white/10 disabled:text-slate-500",
  ].join(" "),

  danger: [
    "border border-rose-500/40 hover:border-rose-400/60",
    "bg-rose-500/10 hover:bg-rose-500/20",
    "text-rose-100 font-semibold",
    "transition-colors",
    "disabled:border-white/10 disabled:text-slate-500 disabled:bg-transparent",
  ].join(" "),
};

const SIZE_CLASSES: Record<OlympusButtonSize, string> = {
  sm: "rounded-xl px-3 py-2 text-sm",
  md: "rounded-2xl px-4 py-3 text-sm",
  lg: "rounded-2xl px-6 py-4 text-base",
};

export const OlympusButton = forwardRef<HTMLButtonElement, OlympusButtonProps>(
  function OlympusButton(
    {
      variant = "emerald",
      size = "md",
      loading = false,
      loadingLabel,
      children,
      disabled,
      className = "",
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          SIZE_CLASSES[size],
          VARIANT_CLASSES[variant],
          "cursor-pointer disabled:cursor-not-allowed",
          className,
        ].join(" ")}
        {...rest}
      >
        {loading && loadingLabel != null ? loadingLabel : children}
      </button>
    );
  },
);
