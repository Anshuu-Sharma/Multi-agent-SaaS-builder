"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ─────────────────────────────────────────────────────
   MET Landing Page
   Aesthetic: Architectural / Editorial / Swiss-grid light
   Fonts loaded via Google Fonts link in head
   ───────────────────────────────────────────────────── */

const AGENTS = [
  {
    role: "CPO",
    title: "Chief Product Officer",
    desc: "Runs discovery sessions, synthesises user needs, and authors the PRD that seeds every project.",
    color: "#D4583A",
    accent: "rgba(212,88,58,0.08)",
  },
  {
    role: "CTO",
    title: "Chief Technology Officer",
    desc: "Designs system architecture, breaks epics into a dependency-aware task graph, and reviews every pull request.",
    color: "#2D6A4F",
    accent: "rgba(45,106,79,0.08)",
  },
  {
    role: "CFO",
    title: "Chief Financial Officer",
    desc: "Tracks every token spent, enforces budget thresholds, and halts operations before costs overrun.",
    color: "#B8860B",
    accent: "rgba(184,134,11,0.08)",
  },
  {
    role: "DEV",
    title: "Development Engineers",
    desc: "Backend and frontend specialists that generate production code inside sandboxed workspaces with git versioning.",
    color: "#3A5FCD",
    accent: "rgba(58,95,205,0.08)",
  },
  {
    role: "QA",
    title: "QA Reviewer",
    desc: "Creates test plans, audits feature completeness, files bugs, and gates deployments until quality bars are met.",
    color: "#7B4F9D",
    accent: "rgba(123,79,157,0.08)",
  },
];

const GATES = [
  { num: "01", label: "PRD Approval", from: "Discovery", to: "Architecture", approver: "CEO" },
  { num: "02", label: "Budget Sign-off", from: "Budget Review", to: "Sprint Planning", approver: "CEO" },
  { num: "03", label: "UAT Gate", from: "Testing", to: "Deployment", approver: "CPO" },
  { num: "04", label: "Launch Gate", from: "Deployment", to: "Complete", approver: "CEO" },
];

const STATS = [
  { value: "6", label: "Autonomous Agents" },
  { value: "15", label: "Orchestrator States" },
  { value: "4", label: "Approval Gates" },
  { value: "$0", label: "Wasted Spend" },
];

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function FadeIn({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Noise SVG for texture ── */
function NoiseBg() {
  return (
    <svg className="pointer-events-none fixed inset-0 z-[1] h-full w-full opacity-[0.03]">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  );
}

/* ── Geometric decorative element ── */
function GridDeco({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden>
      <svg width="200" height="200" viewBox="0 0 200 200" fill="none">
        {Array.from({ length: 10 }).map((_, r) =>
          Array.from({ length: 10 }).map((_, c) => (
            <circle
              key={`${r}-${c}`}
              cx={10 + c * 20}
              cy={10 + r * 20}
              r="1.5"
              fill="#1A1A18"
              opacity="0.12"
            />
          ))
        )}
      </svg>
    </div>
  );
}

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      {/* Google Fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap"
        rel="stylesheet"
      />

      <NoiseBg />

      <style>{`
        .font-display { font-family: 'Instrument Serif', Georgia, serif; }
        .font-body { font-family: 'DM Sans', system-ui, sans-serif; }
      `}</style>

      {/* ━━━━━━━━━━━━━━━━  NAV  ━━━━━━━━━━━━━━━━ */}
      <nav className="font-body fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-5 backdrop-blur-md bg-[#FAF9F7]/80 border-b border-[#1A1A18]/[0.06]">
        <div className="flex items-center gap-2.5">
          {/* Logo mark */}
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 border-2 border-[#1A1A18] rounded-sm rotate-45 scale-[0.6]" />
            <div className="absolute inset-0 border-2 border-[#D4583A] rounded-sm" />
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">MET</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-[13px] font-medium text-[#1A1A18]/60">
          <a href="#agents" className="hover:text-[#1A1A18] transition-colors">Agents</a>
          <a href="#orchestrator" className="hover:text-[#1A1A18] transition-colors">Orchestrator</a>
          <a href="#gates" className="hover:text-[#1A1A18] transition-colors">Gates</a>
          <a href="#budget" className="hover:text-[#1A1A18] transition-colors">Guardrails</a>
        </div>
        <Link
          href="/"
          className="text-[13px] font-semibold px-5 py-2 bg-[#1A1A18] text-[#FAF9F7] rounded-full hover:bg-[#333] transition-colors"
        >
          Open Dashboard
        </Link>
      </nav>

      {/* ━━━━━━━━━━━━━━━━  HERO  ━━━━━━━━━━━━━━━━ */}
      <section className="relative pt-40 pb-28 md:pt-52 md:pb-40 px-6 md:px-12 overflow-hidden">
        {/* Decorative elements */}
        <GridDeco className="absolute top-28 right-12 opacity-50 hidden lg:block" />
        <GridDeco className="absolute bottom-16 left-8 opacity-30 hidden lg:block" />

        {/* Floating geometric accent */}
        <div
          className="absolute top-36 right-[15%] w-72 h-72 rounded-full hidden lg:block"
          style={{
            background: "radial-gradient(circle, rgba(212,88,58,0.06) 0%, transparent 70%)",
            transform: `translateY(${scrollY * 0.08}px)`,
          }}
        />
        <div
          className="absolute bottom-20 left-[10%] w-48 h-48 rounded-full hidden lg:block"
          style={{
            background: "radial-gradient(circle, rgba(45,106,79,0.05) 0%, transparent 70%)",
            transform: `translateY(${scrollY * -0.05}px)`,
          }}
        />

        <div className="max-w-[1100px] mx-auto relative z-10">
          {/* Eyebrow */}
          <FadeIn>
            <div className="font-body flex items-center gap-3 mb-8">
              <div className="h-px w-12 bg-[#D4583A]" />
              <span className="text-[12px] font-semibold tracking-[0.15em] uppercase text-[#D4583A]">
                Multi-Agent Executive Team
              </span>
            </div>
          </FadeIn>

          {/* Headline */}
          <FadeIn delay={0.1}>
            <h1 className="font-display text-[clamp(2.8rem,7vw,6.5rem)] leading-[0.92] tracking-[-0.03em] max-w-[900px]">
              Your software,
              <br />
              built by an{" "}
              <span className="relative inline-block">
                <span className="relative z-10">AI boardroom</span>
                <span
                  className="absolute bottom-[0.08em] left-0 right-0 h-[0.12em] bg-[#D4583A]/20 -z-0"
                  style={{ borderRadius: "2px" }}
                />
              </span>
            </h1>
          </FadeIn>

          {/* Subhead */}
          <FadeIn delay={0.2}>
            <p className="font-body text-[clamp(1rem,1.8vw,1.25rem)] leading-relaxed text-[#1A1A18]/55 max-w-[580px] mt-8">
              Six specialised AI agents — CPO, CTO, CFO, engineers, and QA —
              plan, architect, budget, build, test, and ship your project.
              A deterministic orchestrator keeps them honest.
            </p>
          </FadeIn>

          {/* CTA row */}
          <FadeIn delay={0.3}>
            <div className="flex flex-wrap items-center gap-4 mt-12">
              <Link
                href="/"
                className="font-body inline-flex items-center gap-2.5 text-[14px] font-semibold px-7 py-3.5 bg-[#1A1A18] text-[#FAF9F7] rounded-full hover:bg-[#333] transition-colors"
              >
                Start a project
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-px">
                  <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
              <a
                href="#agents"
                className="font-body inline-flex items-center gap-2 text-[14px] font-medium px-6 py-3.5 border border-[#1A1A18]/15 rounded-full text-[#1A1A18]/70 hover:border-[#1A1A18]/30 hover:text-[#1A1A18] transition-colors"
              >
                See how it works
              </a>
            </div>
          </FadeIn>

          {/* Stats bar */}
          <FadeIn delay={0.45}>
            <div className="font-body mt-20 pt-10 border-t border-[#1A1A18]/[0.08] grid grid-cols-2 md:grid-cols-4 gap-8">
              {STATS.map((s) => (
                <div key={s.label}>
                  <div className="text-[2.5rem] font-display tracking-[-0.02em] text-[#1A1A18]">
                    {s.value}
                  </div>
                  <div className="text-[12px] font-medium tracking-[0.04em] uppercase text-[#1A1A18]/40 mt-1">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━  AGENT SHOWCASE  ━━━━━━━━━━━━━━━━ */}
      <section id="agents" className="relative py-28 md:py-36 px-6 md:px-12">
        <div className="max-w-[1100px] mx-auto">
          <FadeIn>
            <div className="font-body flex items-center gap-3 mb-5">
              <div className="h-px w-12 bg-[#1A1A18]/20" />
              <span className="text-[12px] font-semibold tracking-[0.15em] uppercase text-[#1A1A18]/40">
                The Team
              </span>
            </div>
          </FadeIn>

          <FadeIn delay={0.05}>
            <h2 className="font-display text-[clamp(2rem,4.5vw,4rem)] leading-[0.95] tracking-[-0.025em] max-w-[700px]">
              Five roles,{" "}
              <span className="italic text-[#1A1A18]/40">zero ego</span>
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p className="font-body text-[1rem] leading-relaxed text-[#1A1A18]/45 max-w-[500px] mt-5">
              Each agent owns a clear domain. Their outputs are validated against
              strict schemas before anything touches the database.
            </p>
          </FadeIn>

          {/* Agent cards */}
          <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((agent, i) => (
              <FadeIn key={agent.role} delay={0.08 * i}>
                <div
                  className="group relative p-7 rounded-2xl border border-[#1A1A18]/[0.06] hover:border-[#1A1A18]/[0.12] transition-all duration-500 h-full"
                  style={{ background: agent.accent }}
                >
                  {/* Role badge */}
                  <div
                    className="font-body inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase mb-5"
                    style={{ color: agent.color }}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: agent.color }}
                    />
                    {agent.role}
                  </div>
                  <h3 className="font-display text-[1.6rem] leading-tight tracking-[-0.01em] mb-3">
                    {agent.title}
                  </h3>
                  <p className="font-body text-[0.875rem] leading-relaxed text-[#1A1A18]/50">
                    {agent.desc}
                  </p>

                  {/* Hover corner accent */}
                  <div
                    className="absolute top-0 right-0 w-16 h-16 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background: `linear-gradient(135deg, transparent 50%, ${agent.color}08 50%)`,
                      borderRadius: "0 1rem 0 0",
                    }}
                  />
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━  ORCHESTRATOR  ━━━━━━━━━━━━━━━━ */}
      <section
        id="orchestrator"
        className="relative py-28 md:py-36 px-6 md:px-12"
        style={{ background: "linear-gradient(180deg, #F4F2EF 0%, #FAF9F7 100%)" }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            {/* Left — text */}
            <div>
              <FadeIn>
                <div className="font-body flex items-center gap-3 mb-5">
                  <div className="h-px w-12 bg-[#1A1A18]/20" />
                  <span className="text-[12px] font-semibold tracking-[0.15em] uppercase text-[#1A1A18]/40">
                    Orchestrator
                  </span>
                </div>
              </FadeIn>

              <FadeIn delay={0.05}>
                <h2 className="font-display text-[clamp(2rem,4vw,3.5rem)] leading-[0.95] tracking-[-0.025em]">
                  Deterministic.
                  <br />
                  <span className="italic text-[#1A1A18]/35">Never guesses.</span>
                </h2>
              </FadeIn>

              <FadeIn delay={0.1}>
                <p className="font-body text-[1rem] leading-relaxed text-[#1A1A18]/50 max-w-[440px] mt-6">
                  The orchestrator is pure state-machine logic — no LLM in the loop. It enforces
                  valid transitions across 15 states, manages agent lifecycles, detects dependency
                  deadlocks, and enforces budgets. Predictable by design.
                </p>
              </FadeIn>

              <FadeIn delay={0.15}>
                <div className="font-body mt-8 space-y-3">
                  {[
                    "State machine with 15 defined transitions",
                    "Automatic deadlock detection in task DAGs",
                    "Agent lifecycle management via asyncio",
                    "Hard budget stops at 95% spend",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#2D6A4F] shrink-0" />
                      <span className="text-[0.875rem] text-[#1A1A18]/60">{item}</span>
                    </div>
                  ))}
                </div>
              </FadeIn>
            </div>

            {/* Right — state machine visual */}
            <FadeIn delay={0.1}>
              <div className="relative">
                <div className="bg-white rounded-2xl border border-[#1A1A18]/[0.06] p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  {/* Terminal-style header */}
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[#1A1A18]/[0.06]">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#D4583A]/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#B8860B]/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#2D6A4F]/60" />
                    <span className="ml-3 text-[11px] font-mono text-[#1A1A18]/30 tracking-wide">
                      orchestrator/state_machine
                    </span>
                  </div>

                  {/* State flow diagram */}
                  <div className="space-y-3 font-mono text-[12px]">
                    {[
                      { state: "CREATED", color: "#1A1A18" },
                      { state: "DISCOVERY", color: "#D4583A" },
                      { state: "PRD_REVIEW", color: "#D4583A" },
                      { state: "ARCHITECTURE", color: "#2D6A4F" },
                      { state: "TASK_BREAKDOWN", color: "#2D6A4F" },
                      { state: "BUDGET_REVIEW", color: "#B8860B" },
                      { state: "SPRINT_PLANNING", color: "#3A5FCD" },
                      { state: "DEVELOPMENT", color: "#3A5FCD" },
                      { state: "CODE_REVIEW", color: "#2D6A4F" },
                      { state: "TESTING", color: "#7B4F9D" },
                      { state: "UAT", color: "#7B4F9D" },
                      { state: "DEPLOYMENT", color: "#2D6A4F" },
                      { state: "COMPLETE", color: "#2D6A4F" },
                    ].map((s, i) => (
                      <div key={s.state} className="flex items-center gap-3">
                        <span className="text-[#1A1A18]/20 w-6 text-right tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <span style={{ color: s.color }} className="font-medium">
                          {s.state}
                        </span>
                        {i < 12 && (
                          <svg width="12" height="8" viewBox="0 0 12 8" className="ml-auto opacity-20">
                            <path d="M0 4h10M7 1l3 3-3 3" stroke="#1A1A18" strokeWidth="1" fill="none" />
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subtle shadow card behind */}
                <div className="absolute -bottom-3 left-3 right-3 h-12 bg-[#1A1A18]/[0.02] rounded-2xl -z-10 border border-[#1A1A18]/[0.03]" />
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━  APPROVAL GATES  ━━━━━━━━━━━━━━━━ */}
      <section id="gates" className="relative py-28 md:py-36 px-6 md:px-12">
        <div className="max-w-[1100px] mx-auto">
          <FadeIn>
            <div className="font-body flex items-center gap-3 mb-5">
              <div className="h-px w-12 bg-[#1A1A18]/20" />
              <span className="text-[12px] font-semibold tracking-[0.15em] uppercase text-[#1A1A18]/40">
                Human Oversight
              </span>
            </div>
          </FadeIn>

          <FadeIn delay={0.05}>
            <h2 className="font-display text-[clamp(2rem,4.5vw,4rem)] leading-[0.95] tracking-[-0.025em] max-w-[700px]">
              Nothing ships{" "}
              <span className="italic text-[#1A1A18]/40">without your say</span>
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p className="font-body text-[1rem] leading-relaxed text-[#1A1A18]/45 max-w-[520px] mt-5">
              Four mandatory approval gates let you review, redirect, or reject
              at every critical transition. Full autonomy within boundaries you set.
            </p>
          </FadeIn>

          {/* Gate cards */}
          <div className="mt-16 grid gap-5 md:grid-cols-2">
            {GATES.map((gate, i) => (
              <FadeIn key={gate.num} delay={0.08 * i}>
                <div className="group relative p-7 rounded-2xl bg-white border border-[#1A1A18]/[0.06] hover:border-[#1A1A18]/[0.12] transition-all duration-500 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <div className="flex items-start justify-between mb-5">
                    <span className="font-display text-[2.5rem] leading-none tracking-[-0.03em] text-[#1A1A18]/[0.07]">
                      {gate.num}
                    </span>
                    <span className="font-body text-[11px] font-bold tracking-[0.1em] uppercase px-3 py-1 rounded-full bg-[#1A1A18]/[0.04] text-[#1A1A18]/40">
                      {gate.approver}
                    </span>
                  </div>
                  <h3 className="font-display text-[1.4rem] tracking-[-0.01em] mb-2">
                    {gate.label}
                  </h3>
                  <div className="font-body flex items-center gap-2 text-[0.8rem] text-[#1A1A18]/40">
                    <span>{gate.from}</span>
                    <svg width="16" height="8" viewBox="0 0 16 8" className="opacity-40">
                      <path d="M0 4h14M11 1l3 3-3 3" stroke="currentColor" strokeWidth="1" fill="none" />
                    </svg>
                    <span>{gate.to}</span>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━  BUDGET GUARDRAILS  ━━━━━━━━━━━━━━━━ */}
      <section
        id="budget"
        className="relative py-28 md:py-36 px-6 md:px-12"
        style={{ background: "linear-gradient(180deg, #FAF9F7 0%, #F4F2EF 100%)" }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <FadeIn>
                <div className="font-body flex items-center gap-3 mb-5">
                  <div className="h-px w-12 bg-[#B8860B]/40" />
                  <span className="text-[12px] font-semibold tracking-[0.15em] uppercase text-[#B8860B]/70">
                    Cost Guardrails
                  </span>
                </div>
              </FadeIn>

              <FadeIn delay={0.05}>
                <h2 className="font-display text-[clamp(2rem,4vw,3.5rem)] leading-[0.95] tracking-[-0.025em]">
                  Every token,
                  <br />
                  <span className="italic text-[#1A1A18]/35">accounted for</span>
                </h2>
              </FadeIn>

              <FadeIn delay={0.1}>
                <p className="font-body text-[1rem] leading-relaxed text-[#1A1A18]/50 max-w-[440px] mt-6">
                  Hard limits at every level — per-call, per-phase, and per-project.
                  The CFO agent tracks spend in real time, and the orchestrator enforces
                  automatic shutdowns before you ever overspend.
                </p>
              </FadeIn>
            </div>

            <FadeIn delay={0.1}>
              <div className="space-y-4">
                {[
                  { pct: "60%", action: "Warning alert dispatched", severity: "low" },
                  { pct: "80%", action: "Critical alert to CEO agent", severity: "mid" },
                  { pct: "95%", action: "Hard stop — all agents paused", severity: "high" },
                ].map((tier) => (
                  <div
                    key={tier.pct}
                    className="relative p-6 rounded-2xl bg-white border border-[#1A1A18]/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden"
                  >
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-[#2D6A4F]/20 via-[#B8860B]/30 to-[#D4583A]/40"
                      style={{
                        width: tier.pct,
                        borderRadius: "0 2px 0 0",
                      }}
                    />
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-display text-[2rem] tracking-[-0.02em]">
                        {tier.pct}
                      </span>
                      <span
                        className={`font-body text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-0.5 rounded-full ${
                          tier.severity === "low"
                            ? "bg-[#B8860B]/10 text-[#B8860B]"
                            : tier.severity === "mid"
                            ? "bg-[#D4583A]/10 text-[#D4583A]"
                            : "bg-[#D4583A]/15 text-[#D4583A]"
                        }`}
                      >
                        {tier.severity === "high" ? "HALT" : tier.severity === "mid" ? "CRITICAL" : "WARNING"}
                      </span>
                    </div>
                    <p className="font-body text-[0.85rem] text-[#1A1A18]/45">{tier.action}</p>
                  </div>
                ))}

                {/* Per-call limits */}
                <div className="font-body grid grid-cols-2 gap-4 mt-2">
                  <div className="p-5 rounded-xl bg-white/60 border border-[#1A1A18]/[0.04]">
                    <div className="font-display text-[1.5rem] tracking-[-0.02em]">$0.50</div>
                    <div className="text-[11px] text-[#1A1A18]/35 mt-0.5">Max per LLM call</div>
                  </div>
                  <div className="p-5 rounded-xl bg-white/60 border border-[#1A1A18]/[0.04]">
                    <div className="font-display text-[1.5rem] tracking-[-0.02em]">$50</div>
                    <div className="text-[11px] text-[#1A1A18]/35 mt-0.5">Max per project</div>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━  TECH STRIP  ━━━━━━━━━━━━━━━━ */}
      <section className="py-20 px-6 md:px-12 border-y border-[#1A1A18]/[0.06]">
        <div className="max-w-[1100px] mx-auto">
          <FadeIn>
            <div className="font-body text-center mb-10">
              <span className="text-[12px] font-semibold tracking-[0.15em] uppercase text-[#1A1A18]/30">
                Built with
              </span>
            </div>
          </FadeIn>
          <FadeIn delay={0.05}>
            <div className="font-body flex flex-wrap justify-center gap-x-10 gap-y-4 text-[13px] font-medium text-[#1A1A18]/25">
              {[
                "FastAPI",
                "Next.js 16",
                "PostgreSQL",
                "SQLAlchemy 2.0",
                "Redis",
                "Gemini",
                "WebSockets",
                "Pydantic v2",
                "Docker",
                "Alembic",
              ].map((tech) => (
                <span key={tech} className="hover:text-[#1A1A18]/50 transition-colors cursor-default">
                  {tech}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━  CTA  ━━━━━━━━━━━━━━━━ */}
      <section className="relative py-32 md:py-44 px-6 md:px-12 overflow-hidden">
        {/* Background geometric */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
          <svg width="600" height="600" viewBox="0 0 600 600" fill="none">
            <circle cx="300" cy="300" r="200" stroke="#1A1A18" strokeWidth="0.5" />
            <circle cx="300" cy="300" r="250" stroke="#1A1A18" strokeWidth="0.5" />
            <circle cx="300" cy="300" r="150" stroke="#1A1A18" strokeWidth="0.5" />
            <line x1="100" y1="300" x2="500" y2="300" stroke="#1A1A18" strokeWidth="0.5" />
            <line x1="300" y1="100" x2="300" y2="500" stroke="#1A1A18" strokeWidth="0.5" />
          </svg>
        </div>

        <div className="max-w-[1100px] mx-auto text-center relative z-10">
          <FadeIn>
            <h2 className="font-display text-[clamp(2.2rem,5vw,4.5rem)] leading-[0.92] tracking-[-0.03em]">
              Ready to assemble
              <br />
              <span className="italic">your executive team?</span>
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p className="font-body text-[1rem] text-[#1A1A18]/45 max-w-[420px] mx-auto mt-6 leading-relaxed">
              Describe what you want built. The boardroom takes it from there.
            </p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="flex justify-center mt-10">
              <Link
                href="/"
                className="font-body inline-flex items-center gap-2.5 text-[15px] font-semibold px-9 py-4 bg-[#1A1A18] text-[#FAF9F7] rounded-full hover:bg-[#333] transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
              >
                Launch MET Dashboard
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-px">
                  <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━  FOOTER  ━━━━━━━━━━━━━━━━ */}
      <footer className="font-body border-t border-[#1A1A18]/[0.06] py-10 px-6 md:px-12">
        <div className="max-w-[1100px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="relative w-6 h-6">
              <div className="absolute inset-0 border-[1.5px] border-[#1A1A18]/30 rounded-sm rotate-45 scale-[0.6]" />
              <div className="absolute inset-0 border-[1.5px] border-[#D4583A]/50 rounded-sm" />
            </div>
            <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#1A1A18]/50">
              MET
            </span>
          </div>
          <p className="text-[12px] text-[#1A1A18]/25">
            Multi-Agent Executive Team &middot; Deterministic orchestration for autonomous software delivery
          </p>
        </div>
      </footer>
    </>
  );
}
