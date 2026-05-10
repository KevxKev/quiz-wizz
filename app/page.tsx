import Link from "next/link";

import { Columns, G, Laurel, StarField, TX } from "@/components/olympus";

export default function HomePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        minHeight: "100vh",
        padding: "clamp(80px, 14vh, 140px) 40px 60px",
        position: "relative",
        zIndex: 2,
        gap: 64,
      }}
    >
      <StarField />
      <Columns />
      <style>{`
        @keyframes tv-glow-pulse {
          0%,100% { box-shadow: 0 0 0 2px #C9973A, 0 0 20px 4px #C9973Acc, 0 0 55px 10px #C9973A66, 0 0 100px 20px #C9973A33; }
          50%     { box-shadow: 0 0 0 2px #E8C55A, 0 0 36px 8px #E8C55Aee, 0 0 90px 20px #E8C55A88, 0 0 160px 36px #E8C55A44; }
        }
        .tv-tile-glow { animation: tv-glow-pulse 2.2s ease-in-out infinite; }
      `}</style>

      <div style={{ textAlign: "center", position: "relative", zIndex: 2 }}>
        <Laurel size={60}>
          <h1
            className="gold-shimmer flicker"
            style={{
              fontFamily: "Cinzel,serif",
              fontSize: 88,
              fontWeight: 900,
              letterSpacing: ".12em",
              lineHeight: 1,
              margin: 0,
            }}
          >
            OLYMPUS NIGHT
          </h1>
        </Laurel>
        <p
          style={{
            color: `${G}88`,
            fontFamily: "Cinzel,serif",
            fontSize: 16,
            letterSpacing: ".35em",
            marginTop: 8,
          }}
        >
          MUSIC QUIZ - PARTY EDITION
        </p>
      </div>

      <div style={{ display: "flex", gap: 22, maxWidth: 1160, width: "100%", position: "relative", zIndex: 2, overflow: "visible" }}>
        <Link
          href="/host"
          className="tv-tile-glow"
          style={{
            flex: 1,
            padding: "36px 28px",
            background: "rgba(13,10,40,.92)",
            border: `2px solid ${G}`,
            borderRadius: 16,
            textAlign: "center",
            backdropFilter: "blur(16px)",
            textDecoration: "none",
            color: TX,
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 14 }}>TV</div>
          <h2
            style={{
              fontFamily: "Cinzel,serif",
              fontSize: 24,
              fontWeight: 700,
              color: G,
              letterSpacing: ".08em",
              marginBottom: 10,
            }}
          >
            HOST A GAME
          </h2>
          <p style={{ color: `${TX}55`, fontSize: 13, lineHeight: 1.6 }}>
            Open on your TV.<br />Create a room and run the show.
          </p>
          <div
            style={{
              marginTop: 18,
              display: "inline-block",
              padding: "10px 24px",
              borderRadius: 8,
              background: "linear-gradient(135deg,#7B5000,#C9973A,#E8C55A)",
              color: "#07051a",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: ".08em",
            }}
          >
            START AS HOST -&gt;
          </div>
        </Link>

        <Link
          href="/join"
          style={{
            flex: 1,
            padding: "36px 28px",
            background: "rgba(13,10,40,.75)",
            border: "1.5px solid rgba(255,255,255,.12)",
            borderRadius: 16,
            textAlign: "center",
            backdropFilter: "blur(16px)",
            textDecoration: "none",
            color: TX,
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 14 }}>PHONE</div>
          <h2
            style={{
              fontFamily: "Cinzel,serif",
              fontSize: 24,
              fontWeight: 700,
              color: TX,
              letterSpacing: ".08em",
              marginBottom: 10,
            }}
          >
            JOIN A GAME
          </h2>
          <p style={{ color: `${TX}55`, fontSize: 13, lineHeight: 1.6 }}>
            Open on your phone.<br />Enter the code to play.
          </p>
          <div
            style={{
              marginTop: 18,
              display: "inline-block",
              padding: "10px 24px",
              borderRadius: 8,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.2)",
              color: TX,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: ".08em",
            }}
          >
            JOIN WITH CODE -&gt;
          </div>
        </Link>

        <Link
          href="/submit"
          style={{
            flex: 1,
            padding: "36px 28px",
            background: "rgba(13,10,40,.75)",
            border: "1.5px solid rgba(100,60,200,.35)",
            borderRadius: 16,
            textAlign: "center",
            backdropFilter: "blur(16px)",
            textDecoration: "none",
            color: TX,
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 14 }}>ENTRY</div>
          <h2
            style={{
              fontFamily: "Cinzel,serif",
              fontSize: 24,
              fontWeight: 700,
              color: "#C8A0FF",
              letterSpacing: ".08em",
              marginBottom: 10,
            }}
          >
            ADD ENTRY
          </h2>
          <p style={{ color: `${TX}55`, fontSize: 13, lineHeight: 1.6 }}>
            Build the quiz vault.<br />Add songs, clips and answers.
          </p>
          <div
            style={{
              marginTop: 18,
              display: "inline-block",
              padding: "10px 24px",
              borderRadius: 8,
              background: "rgba(100,60,200,.2)",
              border: "1px solid rgba(140,90,255,.4)",
              color: "#C8A0FF",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: ".08em",
            }}
          >
            OPEN VAULT -&gt;
          </div>
        </Link>
      </div>
    </main>
  );
}
