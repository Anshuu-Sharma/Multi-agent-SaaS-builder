import Link from "next/link";
import {
  FolderKanban,
} from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r border-[#1A1A18]/8 bg-white">
        <div className="flex h-14 items-center gap-3 border-b border-[#1A1A18]/8 px-5">
          {/* Geometric mark — two overlapping squares */}
          <div className="relative size-6 shrink-0">
            <div className="absolute inset-0 rounded-[4px] border-2 border-[#D4583A]" />
            <div className="absolute top-[5px] left-[5px] size-[19px] rounded-[4px] bg-[#D4583A]/12 border-2 border-[#D4583A]" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-[#1A1A18]">
            MET Dashboard
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[#1A1A18]/80 hover:bg-[#1A1A18]/[0.04] hover:text-[#1A1A18] transition-colors"
          >
            <FolderKanban className="size-4" />
            Projects
          </Link>
        </nav>
        <div className="border-t border-[#1A1A18]/8 px-5 py-3">
          <p className="text-[11px] text-[#1A1A18]/45">MET v1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-[#FAF9F7]">
        {children}
      </main>
    </div>
  );
}
