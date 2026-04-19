/**
 * OlympusScene
 *
 * Full-viewport scene wrapper that composes the layered background with
 * a content slot. Drop this around any page section that needs the
 * Olympus Night treatment.
 *
 * Usage:
 *   <OlympusScene variant="lobby" showColumns showParticles>
 *     <YourContent />
 *   </OlympusScene>
 *
 *   // or as a different HTML element:
 *   <OlympusScene as="section" variant="winner">
 *     ...
 *   </OlympusScene>
 *
 * No logic, no hooks — server-component safe.
 */

import type { ElementType, ReactNode } from "react";

import {
  OlympusBackground,
  type OlympusBackgroundVariant,
} from "./OlympusBackground";

export type OlympusSceneProps = {
  children: ReactNode;
  /** Outer HTML element (default: "div") */
  as?: ElementType;
  /** Passed through to OlympusBackground for variant-tinted overlays */
  variant?: OlympusBackgroundVariant;
  /** Show marble column edge decoration */
  showColumns?: boolean;
  /** Show rising ember particles */
  showParticles?: boolean;
  /**
   * "screen"  → min-h-screen, fills the viewport (default for full pages)
   * "full"    → h-full, fills its parent container
   * "auto"    → no height constraint, grows with content
   */
  height?: "screen" | "full" | "auto";
  /** Extra className applied to the root wrapper */
  className?: string;
  /** Extra className applied to the inner content div (sits above the background) */
  contentClassName?: string;
};

const HEIGHT_CLASSES: Record<NonNullable<OlympusSceneProps["height"]>, string> = {
  screen: "min-h-screen",
  full:   "h-full",
  auto:   "",
};

export function OlympusScene({
  children,
  as: Tag = "div",
  variant = "default",
  showColumns = false,
  showParticles = false,
  height = "screen",
  className = "",
  contentClassName = "",
}: OlympusSceneProps) {
  return (
    <Tag
      className={`relative overflow-hidden bg-[var(--oly-night-base)] text-slate-50 ${HEIGHT_CLASSES[height]} ${className}`}
    >
      <OlympusBackground
        variant={variant}
        showColumns={showColumns}
        showParticles={showParticles}
      />

      {/* Content layer sits above the atmospheric background */}
      <div className={`relative z-10 ${contentClassName}`}>
        {children}
      </div>
    </Tag>
  );
}
