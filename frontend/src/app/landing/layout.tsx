import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MET — Multi-Agent Executive Team",
  description:
    "An autonomous AI executive team that builds your software. CPO, CTO, CFO, developers, and QA — orchestrated by a deterministic engine with human oversight.",
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FAF9F7] text-[#1A1A18] overflow-x-hidden">
      {children}
    </div>
  );
}
