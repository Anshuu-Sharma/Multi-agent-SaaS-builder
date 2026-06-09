"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <Card className="bg-zinc-800/50 border-zinc-700/50 max-w-md w-full">
        <CardContent className="flex flex-col items-center text-center py-12 px-6">
          <div className="rounded-full bg-red-900/30 p-3 mb-4">
            <AlertTriangle className="size-6 text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-zinc-400 mb-6">
            {error.message || "An unexpected error occurred."}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => (window.location.href = "/")}>
              Go Home
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
