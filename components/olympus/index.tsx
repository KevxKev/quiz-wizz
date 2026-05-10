"use client";

// Olympus Night design system — ported 1:1 from on-shared.jsx
import { useEffect, useRef, useState } from "react";

export const G  = "#C9973A";
export const GL = "#E8C55A";
export const GD = "#7B5000";
export const BG = "#07051a";
export const TX = "#f0eaff";
export const OPTION_COLORS = ["#7040C8", "#C87040", "#4090C8", "#40B870"];

/* ── Star field ────────────────────────────────────────────── */
export function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      c.width  = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const stars = Array.from({ length: 260 }, () => ({
      x:     Math.random(),
      y:     Math.random(),
      r:     Math.random() * 1.5 + 0.15,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.004 + 0.0015,
    }));

    let raf: number;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      stars.forEach((s) => {
        const a = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.speed * 500 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x * c.width, s.y * c.height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232,220,255,${a})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <canvas
      ref={ref}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}
    />
  );
}

/* ── Column silhouettes ────────────────────────────────────── */
export function Columns() {
  const defs = [
    { x: 4,  h: 170, w: 30 },
    { x: 10, h: 220, w: 42 },
    { x: 19, h: 150, w: 26 },
    { x: 79, h: 180, w: 32 },
    { x: 87, h: 225, w: 44 },
    { x: 94, h: 155, w: 28 },
  ];

  const Col = ({ x, h, w }: { x: number; h: number; w: number }) => {
    const cx = (x / 100) * 1920;
    return (
      <g fill="rgba(16,8,48,.92)">
        <rect x={cx - w / 2 - 8}  y={230 - h}      width={w + 16} height={12}     rx={2} />
        <rect x={cx - w / 2 - 4}  y={230 - h + 12} width={w + 8}  height={6} />
        <rect x={cx - w / 2}      y={230 - h + 18} width={w}      height={h - 46} />
        <rect x={cx - w / 2 + 4}  y={230 - h + 18} width={3}      height={h - 46} fill="rgba(255,255,255,.04)" />
        <rect x={cx - w / 2 + 10} y={230 - h + 18} width={3}      height={h - 46} fill="rgba(255,255,255,.04)" />
        <rect x={cx - w / 2 - 6}  y={192}          width={w + 12} height={10}     rx={1} />
        <rect x={cx - w / 2 - 12} y={202}          width={w + 24} height={12}     rx={1} />
        <rect x={cx - w / 2 - 14} y={214}          width={w + 28} height={16}     rx={2} />
      </g>
    );
  };

  return (
    <svg
      style={{
        position: "fixed", bottom: 0, left: 0,
        width: "100%", height: "230px",
        pointerEvents: "none", zIndex: 1,
      }}
      viewBox="0 0 1920 230"
      preserveAspectRatio="xMidYMax meet"
    >
      {defs.map((d, i) => (
        <Col key={i} {...d} />
      ))}
      <line x1="0" y1="228" x2="1920" y2="228" stroke={`${G}44`} strokeWidth="1" />
    </svg>
  );
}

/* ── Meander divider ───────────────────────────────────────── */
export function Meander({
  side = "top",
  opacity = 0.45,
}: {
  side?: "top" | "bottom";
  opacity?: number;
}) {
  const hex = Math.round(opacity * 255).toString(16).padStart(2, "0");
  return (
    <div
      style={{
        position: "absolute",
        [side]: 0,
        left: 0,
        right: 0,
        height: 2,
        background: `linear-gradient(90deg,transparent,${G}${hex} 20%,${G}${hex} 80%,transparent)`,
      }}
    />
  );
}

/* ── Laurel wreath ─────────────────────────────────────────── */
export function Laurel({
  size = 48,
  children,
}: {
  size?: number;
  children: React.ReactNode;
}) {
  const LeafSet = ({ flip }: { flip: boolean }) => (
    <svg
      width={size}
      height={size * 0.7}
      viewBox="0 0 55 38"
      style={flip ? { transform: "scaleX(-1)" } : {}}
    >
      {[
        { cx: 10, cy: 22, a: -45 },
        { cx: 18, cy: 16, a: -30 },
        { cx: 27, cy: 12, a: -15 },
        { cx: 36, cy: 10, a: 0 },
      ].map((l, i) => (
        <ellipse
          key={i}
          cx={l.cx}
          cy={l.cy}
          rx={8}
          ry={3}
          fill="none"
          stroke={G}
          strokeWidth="1.4"
          opacity={0.5 + i * 0.1}
          transform={`rotate(${l.a} ${l.cx} ${l.cy})`}
        />
      ))}
      <path d="M4,34 Q28,28 52,34" stroke={G} strokeWidth="1" fill="none" opacity=".35" />
    </svg>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
      <LeafSet flip={false} />
      {children}
      <LeafSet flip={true} />
    </div>
  );
}

/* ── Lightning bolt ────────────────────────────────────────── */
export function Bolt({ size = 24, color = G }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size * 1.5}
      viewBox="0 0 16 24"
      style={{ filter: `drop-shadow(0 0 5px ${color}99)`, flexShrink: 0 }}
    >
      <path d="M11 1 L2 14 L8 14 L5 23 L14 10 L8 10 Z" fill={color} />
    </svg>
  );
}

/* ── Panel ─────────────────────────────────────────────────── */
export function Panel({
  children,
  style,
  glow,
  accent,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  glow?: boolean;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "rgba(13,10,40,.82)",
        border: `1px solid ${accent ?? G}${glow ? "66" : "30"}`,
        backdropFilter: "blur(16px)",
        borderRadius: 12,
        position: "relative",
        ...(glow ? { animation: "pulse-glow 2.5s ease-in-out infinite" } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── Button ────────────────────────────────────────────────── */
export function Btn({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled,
  style = {},
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "dark" | "danger" | "worthy";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const sz: Record<string, React.CSSProperties> = {
    sm: { padding: "8px 22px",  fontSize: 13 },
    md: { padding: "13px 30px", fontSize: 15 },
    lg: { padding: "18px 48px", fontSize: 18 },
  };
  const va: Record<string, React.CSSProperties> = {
    primary: {
      background: `linear-gradient(135deg,${GD},${G},${GL})`,
      color: BG, border: "none",
      boxShadow: `0 4px 20px ${G}44`,
    },
    ghost:  { background: "transparent", color: G,    border: `1.5px solid ${G}55` },
    dark:   { background: "rgba(255,255,255,.06)", color: TX, border: "1px solid rgba(255,255,255,.12)" },
    danger: { background: "linear-gradient(135deg,#5a0000,#a02020)", color: "white", border: "none" },
    worthy: {
      background: "linear-gradient(135deg,#1a0060,#5020c0,#8040e0)",
      color: "white", border: "none",
      boxShadow: "0 4px 24px rgba(100,50,220,.55)",
    },
  };
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...sz[size],
        ...va[variant],
        fontFamily: "Plus Jakarta Sans,sans-serif",
        fontWeight: 700,
        letterSpacing: ".07em",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "all .2s",
        textTransform: "uppercase",
        transform: hov && !disabled ? "translateY(-2px)" : "none",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ── Avatar chip ───────────────────────────────────────────── */
export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  const palette = ["#6B2ED4", "#2E6BD4", "#D42E6B", "#2ED4A0", "#D4882E", "#882ED4"];
  const ci = (name.charCodeAt(0) + name.charCodeAt(name.length - 1)) % palette.length;
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg,${palette[ci]}cc,${palette[(ci + 2) % palette.length]}cc)`,
        border: `1.5px solid ${G}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Cinzel,serif",
        fontWeight: 700,
        fontSize: size * 0.38,
        color: G,
        flexShrink: 0,
      }}
    >
      {name[0].toUpperCase()}
    </div>
  );
}

/* ── Countdown ring ───────────────────────────────────────── */
export function Ring({
  value,
  max,
  size = 180,
  fontSize,
}: {
  value: number;
  max: number;
  size?: number;
  fontSize?: number;
}) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const col = value <= 5 ? "#E84040" : value <= 10 ? "#E89030" : G;
  const fs = fontSize ?? size * 0.38;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size} height={size} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - Math.max(0, value) / max)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s linear,stroke .5s" }}
        />
      </svg>
      <span
        style={{
          fontFamily: "Cinzel,serif",
          fontSize: fs,
          fontWeight: 900,
          color: col,
          lineHeight: 1,
          textShadow: `0 0 20px ${col}88`,
          zIndex: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Mode badge ───────────────────────────────────────────── */
export function ModeBadge({ mode }: { mode: string }) {
  const cfg: Record<string, { icon: string; label: string; color: string }> = {
    "audio-only":  { icon: "A", label: "Audio Only", color: "#7040C8" },
    "video-only":  { icon: "V", label: "Video Only", color: "#4090C8" },
    "audio-video": { icon: "AV", label: "Audio + Video", color: "#40B870" },
  };
  const c = cfg[mode] ?? cfg["audio-only"];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        background: `${c.color}22`,
        border: `1px solid ${c.color}55`,
        color: c.color,
        letterSpacing: ".06em",
      }}
    >
      {c.icon} {c.label}
    </span>
  );
}

/* ── Fake YouTube player ──────────────────────────────────── */
export function YoutubeMock({
  mode = "audio-video",
  w = 560,
  h = 315,
}: {
  mode?: string;
  w?: number | string;
  h?: number | string;
}) {
  const muted = mode === "video-only";
  return (
    <div
      style={{
        width: w,
        height: h,
        background: "#000",
        borderRadius: 10,
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,.1)",
        boxShadow: `0 0 60px rgba(0,0,0,.9), 0 0 20px ${G}11`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(160deg,#0d0520 0%,#1a0840 45%,#050210 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", opacity: 0.12, userSelect: "none" }}>
          <div style={{ fontSize: 100 }}>MUSIC</div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg,rgba(0,0,0,.08) 0px,rgba(0,0,0,.08) 1px,transparent 1px,transparent 3px)",
          pointerEvents: "none",
        }}
      />

      {muted && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,.25)",
            background: "rgba(0,0,0,.45)",
            color: "white",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".08em",
          }}
        >
          MUTED
        </div>
      )}
    </div>
  );
}
