/**
 * OlympusBackground
 *
 * A purely presentational layered backdrop for Olympus Night scenes.
 * Renders: night sky gradient → stars → mist blobs → cloud wisps
 *          → optional ember particles → optional marble column hints
 *
 * Usage:
 *   <div className="relative min-h-screen overflow-hidden">
 *     <OlympusBackground showColumns showParticles />
 *     <div className="relative z-10">{content}</div>
 *   </div>
 *
 * No logic, no hooks, no browser APIs — safe for server-side rendering.
 */

import type { CSSProperties } from "react";

/* ── Deterministic data sets ─────────────────────────────────────────────── */

type StarDot = { x: number; y: number; d: number; s: number };
type Ember   = { x: number; delay: number; duration: number; drift: number };

/** 40 fixed star positions (left %, top %, animation-delay s, size px) */
const STARS: StarDot[] = [
  { x:  4.2, y:  7.5, d: 0.0, s: 1.2 },
  { x: 11.8, y:  3.1, d: 1.4, s: 1.8 },
  { x: 19.5, y: 11.3, d: 0.6, s: 1.0 },
  { x: 26.1, y:  5.8, d: 2.1, s: 1.5 },
  { x: 33.7, y:  9.2, d: 0.9, s: 1.0 },
  { x: 41.4, y:  2.6, d: 1.7, s: 1.8 },
  { x: 48.9, y:  8.4, d: 3.2, s: 1.2 },
  { x: 56.3, y:  4.0, d: 0.4, s: 1.6 },
  { x: 63.8, y: 12.7, d: 2.5, s: 1.0 },
  { x: 71.2, y:  6.1, d: 1.1, s: 1.4 },
  { x: 78.9, y:  3.8, d: 0.7, s: 1.8 },
  { x: 85.4, y: 10.5, d: 2.8, s: 1.0 },
  { x: 92.0, y:  5.3, d: 1.3, s: 1.5 },
  { x:  7.6, y: 19.1, d: 2.0, s: 1.2 },
  { x: 15.3, y: 22.8, d: 0.5, s: 1.0 },
  { x: 23.9, y: 17.4, d: 3.1, s: 1.6 },
  { x: 31.5, y: 24.2, d: 1.6, s: 1.0 },
  { x: 44.8, y: 20.6, d: 0.2, s: 1.4 },
  { x: 52.1, y: 16.3, d: 2.3, s: 1.8 },
  { x: 59.7, y: 23.9, d: 0.8, s: 1.0 },
  { x: 67.2, y: 18.7, d: 1.9, s: 1.2 },
  { x: 74.6, y: 25.1, d: 3.0, s: 1.5 },
  { x: 82.3, y: 21.4, d: 0.3, s: 1.0 },
  { x: 89.8, y: 15.9, d: 2.6, s: 1.8 },
  { x:  2.8, y: 32.5, d: 1.2, s: 1.2 },
  { x: 10.5, y: 38.0, d: 0.9, s: 1.0 },
  { x: 38.2, y: 30.3, d: 2.4, s: 1.5 },
  { x: 46.9, y: 35.7, d: 0.6, s: 1.0 },
  { x: 54.4, y: 29.1, d: 3.3, s: 1.6 },
  { x: 62.0, y: 36.8, d: 1.0, s: 1.2 },
  { x: 69.5, y: 31.5, d: 2.7, s: 1.8 },
  { x: 77.1, y: 37.2, d: 0.1, s: 1.0 },
  { x: 84.7, y: 28.9, d: 1.8, s: 1.4 },
  { x: 95.3, y: 34.6, d: 2.2, s: 1.0 },
  { x: 17.8, y: 43.2, d: 0.4, s: 1.5 },
  { x: 29.4, y: 46.8, d: 1.5, s: 1.0 },
  { x: 87.6, y: 42.5, d: 2.9, s: 1.8 },
  { x:  6.0, y: 50.0, d: 0.8, s: 1.2 },
  { x: 49.2, y: 44.3, d: 1.6, s: 1.0 },
  { x: 93.1, y: 48.7, d: 3.4, s: 1.5 },
];

/** 18 ember particles (left %, animation-delay s, duration s, horizontal drift px) */
const EMBERS: Ember[] = [
  { x: 18, delay: 0.0, duration: 4.2, drift:  10 },
  { x: 31, delay: 1.3, duration: 5.0, drift: -8  },
  { x: 47, delay: 0.5, duration: 3.8, drift:  14 },
  { x: 62, delay: 2.1, duration: 4.6, drift: -6  },
  { x: 74, delay: 0.8, duration: 5.3, drift:  12 },
  { x: 85, delay: 1.7, duration: 4.0, drift: -10 },
  { x: 24, delay: 3.0, duration: 4.8, drift:  8  },
  { x: 38, delay: 0.2, duration: 5.5, drift: -14 },
  { x: 52, delay: 2.5, duration: 3.6, drift:  6  },
  { x: 66, delay: 1.0, duration: 4.4, drift: -12 },
  { x: 79, delay: 3.3, duration: 5.1, drift:  10 },
  { x: 12, delay: 1.8, duration: 4.7, drift: -6  },
  { x: 43, delay: 0.6, duration: 5.8, drift:  16 },
  { x: 57, delay: 2.8, duration: 3.9, drift: -8  },
  { x: 71, delay: 1.4, duration: 4.3, drift:  12 },
  { x: 88, delay: 0.3, duration: 5.6, drift: -10 },
  { x: 35, delay: 3.6, duration: 4.1, drift:  6  },
  { x: 92, delay: 2.0, duration: 5.2, drift: -14 },
];

/* ── Column stripe sub-component ─────────────────────────────────────────── */

function ColumnStripes({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";
  const containerStyle: CSSProperties = {
    background: isLeft
      ? "linear-gradient(90deg, rgba(210,190,140,0.07) 0%, rgba(210,190,140,0.03) 60%, transparent 100%)"
      : "linear-gradient(270deg, rgba(210,190,140,0.07) 0%, rgba(210,190,140,0.03) 60%, transparent 100%)",
  };
  const linePositions = [0.18, 0.38, 0.62, 0.82];

  return (
    <div
      className={`absolute top-0 bottom-0 w-16 sm:w-24 ${isLeft ? "left-0" : "right-0"}`}
      style={containerStyle}
    >
      {linePositions.map((pos) => (
        <div
          key={pos}
          className="absolute top-0 bottom-0 w-px"
          style={{
            [isLeft ? "left" : "right"]: `${pos * 100}%`,
            background:
              "linear-gradient(180deg, transparent 0%, rgba(210,190,140,0.18) 20%, rgba(210,190,140,0.10) 80%, transparent 100%)",
          }}
        />
      ))}
      {/* Capital hint at top */}
      <div
        className="absolute top-0 left-0 right-0 h-8"
        style={{ background: "rgba(210,190,140,0.06)", borderBottom: "1px solid rgba(210,190,140,0.10)" }}
      />
      {/* Base hint at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-8"
        style={{ background: "rgba(210,190,140,0.06)", borderTop: "1px solid rgba(210,190,140,0.10)" }}
      />
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export type OlympusBackgroundVariant = "default" | "lobby" | "game" | "winner";

export type OlympusBackgroundProps = {
  /** Accent colour overlay shift for different game states */
  variant?: OlympusBackgroundVariant;
  /** Render marble column silhouettes on the edges */
  showColumns?: boolean;
  /** Render rising ember / mote particles */
  showParticles?: boolean;
  /** Extra className on the root element */
  className?: string;
};

export function OlympusBackground({
  variant = "default",
  showColumns = false,
  showParticles = false,
  className = "",
}: OlympusBackgroundProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* ── Layer 1: Night sky gradient ─────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 130% 80% at 50% -5%, #0E0830 0%, #060518 45%, #030310 80%, #020209 100%)",
        }}
      />

      {/* ── Layer 2: Stars ──────────────────────────────────────────── */}
      <div className="absolute inset-0">
        {STARS.map((star, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${star.x}%`,
              top:  `${star.y}%`,
              width:  `${star.s}px`,
              height: `${star.s}px`,
              animation: `oly-star-twinkle ${2.2 + star.d * 0.6}s ease-in-out ${star.d}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ── Layer 3: Mist blobs ─────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          animation: "oly-mist-drift 20s ease-in-out infinite",
          background:
            "radial-gradient(ellipse 85% 45% at 28% 38%, rgba(80,50,180,0.10) 0%, transparent 65%)," +
            "radial-gradient(ellipse 65% 38% at 72% 58%, rgba(60,30,140,0.08) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          animation: "oly-mist-drift 28s ease-in-out 7s infinite reverse",
          background:
            "radial-gradient(ellipse 75% 32% at 58% 22%, rgba(100,60,200,0.07) 0%, transparent 60%)",
        }}
      />

      {/* ── Layer 4: Cloud wisps ────────────────────────────────────── */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: "12%",
          height: "140px",
          animation: "oly-cloud-drift 32s ease-in-out infinite",
          background:
            "radial-gradient(ellipse 100% 100% at 50% 50%, rgba(140,110,220,0.065) 0%, transparent 70%)",
          filter: "blur(22px)",
        }}
      />
      <div
        className="absolute left-0 right-0"
        style={{
          bottom: "8%",
          height: "120px",
          animation: "oly-cloud-drift 40s ease-in-out 12s infinite reverse",
          background:
            "radial-gradient(ellipse 100% 100% at 50% 50%, rgba(110,80,200,0.055) 0%, transparent 70%)",
          filter: "blur(18px)",
        }}
      />

      {/* ── Layer 5: Variant-specific ambient overlay ────────────────── */}
      {variant === "winner" && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 55% 35% at 50% 25%, rgba(201,162,39,0.09) 0%, transparent 70%)",
            animation: "oly-pulse-glow 4s ease-in-out infinite",
          }}
        />
      )}
      {variant === "lobby" && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 40% at 50% 60%, rgba(80,50,160,0.10) 0%, transparent 70%)",
          }}
        />
      )}
      {variant === "game" && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 30% at 50% 10%, rgba(34,211,238,0.05) 0%, transparent 70%)",
          }}
        />
      )}

      {/* ── Layer 6: Ember particles (optional) ─────────────────────── */}
      {showParticles &&
        EMBERS.map((ember, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={
              {
                left:    `${ember.x}%`,
                bottom:  "4%",
                width:   "2px",
                height:  "2px",
                background: "rgba(240,192,64,0.75)",
                boxShadow: "0 0 4px rgba(240,192,64,0.5)",
                "--oly-drift": `${ember.drift}px`,
                animation: `oly-ember-rise ${ember.duration}s ease-in ${ember.delay}s infinite`,
              } as CSSProperties
            }
          />
        ))}

      {/* ── Layer 7: Marble columns (optional) ──────────────────────── */}
      {showColumns && (
        <>
          <ColumnStripes side="left"  />
          <ColumnStripes side="right" />
        </>
      )}
    </div>
  );
}
