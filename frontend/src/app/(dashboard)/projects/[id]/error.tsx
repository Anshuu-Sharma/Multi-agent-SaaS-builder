"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Project page error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <Card className="bg-zinc-800/50 border-zinc-700/50 max-w-md w-full">
        <CardContent className="flex flex-col items-center text-center py-12 px-6">
          <div className="rounded-full bg-red-900/30 p-3 mb-4">
            <AlertTriangle className="size-6 text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-2">
            Error loading project
          </h2>
          <p className="text-sm text-zinc-400 mb-6">
            {error.message || "Could not load project data. The project may not exist or the server may be unavailable."}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Back to Projects</Link>
            </Button>
            <Button size="sm" onClick={reset}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
