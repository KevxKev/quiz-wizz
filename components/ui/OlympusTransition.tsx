"use client";

/**
 * OlympusTransition
 *
 * A presentation-only fullscreen overlay for scene transitions.
 * Mount it in the page; flip `active` to trigger the animation.
 *
 * Transition types:
 *   "cloud-wipe"  — sweeps a textured cloud layer across the screen
 *   "blur-fade"   — fades in a full-screen blur then fades back out
 *
 * Usage:
 *   const [transitioning, setTransitioning] = useState(false);
 *
 *   const handleStart = async () => {
 *     setTransitioning(true);
 *     await startGame();             // your existing logic — untouched
 *     setTransitioning(false);
 *   };
 *
 *   <OlympusTransition type="cloud-wipe" active={transitioning} />
 */

import type { CSSProperties } from "react";

export type OlympusTransitionType = "cloud-wipe" | "blur-fade";

export type OlympusTransitionProps = {
  /** Trigger the transition animation */
  active: boolean;
  /** Which animation style to use */
  type?: OlympusTransitionType;
  /** z-index of the overlay (default 50) */
  zIndex?: number;
};

const CLOUD_TEXTURE =
  "radial-gradient(ellipse 120% 60% at 10% 40%, rgba(160,130,220,0.7) 0%, transparent 60%)," +
  "radial-gradient(ellipse 80% 80% at 80% 20%, rgba(100,70,200,0.65) 0%, transparent 55%)," +
  "radial-gradient(ellipse 100% 50% at 50% 80%, rgba(130,100,220,0.55) 0%, transparent 60%)," +
  "linear-gradient(165deg, #0D0830 0%, #180A45 40%, #0A0520 100%)";

export function OlympusTransition({
  active,
  type = "blur-fade",
  zIndex = 50,
}: OlympusTransitionProps) {
  if (!active) return null;

  if (type === "cloud-wipe") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{ zIndex } as CSSProperties}
      >
        {/* Leading cloud edge */}
        <div
          className="absolute inset-0"
          style={{
            background: CLOUD_TEXTURE,
            animation: "oly-cloud-wipe-in 0.65s cubic-bezier(0.22,1,0.36,1) forwards",
          }}
        />
        {/* Trailing fade-out */}
        <div
          className="absolute inset-0"
          style={{
            background: CLOUD_TEXTURE,
            animation: "oly-cloud-wipe-out 0.55s cubic-bezier(0.64,0,0.78,0) 0.65s forwards",
            opacity: 0,
          }}
        />
      </div>
    );
  }

  // blur-fade
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={
        {
          zIndex,
          background: "rgba(4,3,18,0.88)",
          backdropFilter: "blur(10px)",
          animation: "oly-blur-fade-in 0.4s ease-out forwards",
        } as CSSProperties
      }
    />
  );
}
