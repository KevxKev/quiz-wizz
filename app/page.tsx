import Link from "next/link";

import { OlympusBackground } from "@/components/ui";

const pages = [
  {
    href: "/host",
    title: "Host screen",
    description: "The TV screen — YouTube playback, round controls, and the game lobby.",
  },
  {
    href: "/join",
    title: "Join the feast",
    description: "Players enter a room seal and display name from their phones.",
  },
  {
    href: "/answer",
    title: "Answer screen",
    description: "Private mobile answer controller for the active round.",
  },
  {
    href: "/submit",
    title: "Add sacred entries",
    description: "Submit hidden quiz entries without spoiling the host.",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--oly-night-base)] text-slate-50">
      <OlympusBackground showColumns showParticles />

      <div className="relative z-10 mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        {/* Hero */}
        <section className="pt-4 text-center">
          <h1
            className="oly-text-gold-shimmer font-black uppercase"
            style={{ fontSize: "clamp(2.4rem, 7vw, 5rem)", letterSpacing: "0.1em" }}
          >
            ✦ Olympus Night ✦
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-slate-400 sm:text-lg">
            One screen on the TV. Players join from their phones. Who reigns supreme?
          </p>
          <div className="mx-auto mt-5 flex max-w-xs items-center gap-3">
            <div className="flex-1 border-t" style={{ borderColor: "rgba(201,162,39,0.2)" }} />
            <span className="text-xs" style={{ color: "var(--oly-gold-dim)" }}>⚡</span>
            <div className="flex-1 border-t" style={{ borderColor: "rgba(201,162,39,0.2)" }} />
          </div>
        </section>

        {/* Page links */}
        <section className="grid gap-4 sm:grid-cols-2">
          {pages.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="rounded-2xl p-5 transition-all"
              style={{
                background: "rgba(5,3,18,0.60)",
                border: "1px solid rgba(201,162,39,0.15)",
                backdropFilter: "blur(6px)",
              }}
            >
              <h2 className="text-lg font-semibold" style={{ color: "var(--oly-gold-bright)" }}>
                {page.title}
              </h2>
              <p className="mt-2 text-sm text-slate-400">{page.description}</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
