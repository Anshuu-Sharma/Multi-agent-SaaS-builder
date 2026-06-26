"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listProjects, createProject, type Project, type ProjectState } from "@/lib/api";

const STATE_COLORS: Record<ProjectState, string> = {
  // Planning states — blue
  briefing: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  discovery: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  prd_creation: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  // Review states — amber/gold
  prd_review: "bg-[#B8860B]/8 text-[#B8860B] border border-[#B8860B]/15",
  design_review: "bg-[#B8860B]/8 text-[#B8860B] border border-[#B8860B]/15",
  arch_review: "bg-[#B8860B]/8 text-[#B8860B] border border-[#B8860B]/15",
  budget_review: "bg-[#B8860B]/8 text-[#B8860B] border border-[#B8860B]/15",
  // Build states — blue
  design: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  architecture: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  budget: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  sprint_planning: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  development: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  // Testing/release states — green
  code_review: "bg-[#2D6A4F]/8 text-[#2D6A4F] border border-[#2D6A4F]/15",
  qa_testing: "bg-[#2D6A4F]/8 text-[#2D6A4F] border border-[#2D6A4F]/15",
  uat: "bg-[#2D6A4F]/8 text-[#2D6A4F] border border-[#2D6A4F]/15",
  deployment: "bg-[#2D6A4F]/8 text-[#2D6A4F] border border-[#2D6A4F]/15",
  // Terminal states
  complete: "bg-[#2D6A4F]/10 text-[#2D6A4F] border border-[#2D6A4F]/20",
  failed: "bg-[#D4583A]/8 text-[#D4583A] border border-[#D4583A]/15",
  paused: "bg-[#D97706]/8 text-[#D97706] border border-[#D97706]/15",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load projects");
        setProjects([]);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const project = await createProject({ name: name.trim(), brief: brief.trim() });
      setDialogOpen(false);
      setName("");
      setBrief("");
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1A18]">Projects</h1>
          <p className="text-sm text-[#1A1A18]/70 mt-1">
            Manage your multi-agent executive team projects
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 bg-[#D4583A] hover:bg-[#D4583A]/90 text-white">
              <Plus className="size-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border border-[#1A1A18]/8 shadow-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[#1A1A18]">Create Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-[#1A1A18]/70 mb-1.5 block">
                  Project Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. SaaS Analytics Platform"
                  className="bg-[#FAF9F7] border-[#1A1A18]/10 text-[#1A1A18] placeholder:text-[#1A1A18]/45 focus-visible:ring-[#D4583A]/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#1A1A18]/70 mb-1.5 block">
                  Brief
                </label>
                <Textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Describe what this project should build..."
                  rows={4}
                  className="bg-[#FAF9F7] border-[#1A1A18]/10 text-[#1A1A18] placeholder:text-[#1A1A18]/45 resize-none focus-visible:ring-[#D4583A]/30"
                />
              </div>
              {createError && (
                <p className="text-xs text-[#D4583A]">{createError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialogOpen(false)}
                  className="text-[#1A1A18]/80 hover:text-[#1A1A18] hover:bg-[#1A1A18]/[0.04]"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!name.trim() || creating}
                  className="bg-[#D4583A] hover:bg-[#D4583A]/90 text-white"
                >
                  {creating ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between rounded-md border border-[#D4583A]/20 bg-[#D4583A]/5 px-4 py-3 mb-4">
          <p className="text-sm text-[#D4583A]">{error}</p>
          <button
            className="text-xs text-[#D4583A] hover:text-[#D4583A]/80 underline"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Project list */}
      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-white/60 border border-[#1A1A18]/6 animate-pulse">
              <CardContent className="p-5 h-20" />
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card className="bg-white/40 border border-dashed border-[#1A1A18]/15">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-[#FAF9F7] border border-[#1A1A18]/8 p-3 mb-3">
              <Plus className="size-6 text-[#1A1A18]/45" />
            </div>
            <p className="text-sm text-[#1A1A18]/80 mb-1">No projects yet</p>
            <p className="text-xs text-[#1A1A18]/45">
              Create your first project to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="bg-white border border-[#1A1A18]/8 hover:border-[#1A1A18]/15 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <CardContent className="flex items-center justify-between p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-sm font-medium text-[#1A1A18] truncate">
                      {project.name}
                    </h3>
                    <Badge
                      className={`text-[10px] px-2 py-0 font-medium ${
                        STATE_COLORS[project.state] ?? STATE_COLORS.briefing
                      }`}
                    >
                      {project.state.replace("_", " ")}
                    </Badge>
                  </div>
                  {project.brief && (
                    <p className="text-xs text-[#1A1A18]/55 truncate max-w-lg">
                      {project.brief}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-[#1A1A18]/45 whitespace-nowrap ml-4">
                  {new Date(project.created_at).toLocaleDateString()}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
