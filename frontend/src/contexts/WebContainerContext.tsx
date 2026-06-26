"use client";

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react";
import { readWorkspaceFile, type WorkspaceFile, type FileContent } from "@/lib/api";

type LogListener = (data: string) => void;

interface PreviewState {
  status: "idle" | "building" | "ready" | "error";
  previewHtml: string | null;
  error: string | null;

  isRunning: boolean;
  runPreview: (files: WorkspaceFile[], projectId: string) => Promise<void>;
  stopPreview: () => void;

  getTerminalHistory: () => string;
  onTerminalData: (listener: LogListener) => () => void;
}

const PreviewCtx = createContext<PreviewState | null>(null);

/**
 * Strips Next.js-specific imports (next/image, next/link, @/lib/utils) and
 * rewrites JSX so it can run with plain React from a CDN.
 */
function stripForPreview(code: string): string {
  // Remove ALL import statements
  let cleaned = code.replace(/^import\s+.*?['"];?\s*$/gm, "");
  // Remove 'use client' / 'use server' directives
  cleaned = cleaned.replace(/^['"]use (client|server)['"];?\s*$/gm, "");
  // Remove TypeScript type annotations: `: Type`, `<Type>`, `as Type`
  // Remove interface/type declarations
  cleaned = cleaned.replace(/^(export\s+)?(interface|type)\s+\w+[\s\S]*?^\}/gm, "");
  // Remove inline type annotations like `: string`, `: number`, `: React.FC<Props>`
  // Be careful not to break JSX - only strip in function signatures
  cleaned = cleaned.replace(/:\s*(?:string|number|boolean|void|any|null|undefined|React\.\w+(?:<[^>]*>)?)\s*(?=[,)={])/g, "");

  // Replace <Image .../> with <img .../>
  cleaned = cleaned.replace(/<Image\b/g, "<img");
  // Handle fill prop (Next.js Image specific)
  cleaned = cleaned.replace(/\s+fill\b(?!=)/g, ' style={{position:"absolute",width:"100%",height:"100%",objectFit:"cover"}}');
  // Handle priority prop
  cleaned = cleaned.replace(/\s+priority\b(?!=)/g, "");
  // Replace next/link <Link> with <a>
  cleaned = cleaned.replace(/<Link\b/g, "<a");
  cleaned = cleaned.replace(/<\/Link>/g, "</a>");
  cleaned = cleaned.replace(/\bhref=\{/g, "href={");

  // Strip export keywords but keep the declarations
  cleaned = cleaned.replace(/^export\s+default\s+function\s+/gm, "function ");
  cleaned = cleaned.replace(/^export\s+default\s+/gm, "");
  cleaned = cleaned.replace(/^export\s+function\s+/gm, "function ");
  cleaned = cleaned.replace(/^export\s+const\s+/gm, "const ");
  cleaned = cleaned.replace(/^export\s+/gm, "");

  // cn() is provided as a global polyfill in the preview HTML

  return cleaned;
}

/**
 * Builds a self-contained HTML page that renders all the React components
 * using CDN-loaded React, ReactDOM, Babel, and Tailwind CSS.
 */
function buildPreviewHtml(
  files: { path: string; content: string }[],
  tailwindConfig: string | null,
): string {
  // Find all TSX/JSX component files
  const componentFiles = files.filter(
    (f) => (f.path.endsWith(".tsx") || f.path.endsWith(".jsx")) && !f.path.includes("layout")
  );

  // Find globals.css
  const globalsCss = files.find((f) => f.path.endsWith("globals.css"));

  // Find page.tsx (the main entry)
  const pageFile = componentFiles.find((f) => f.path.endsWith("page.tsx") || f.path.endsWith("page.jsx"));

  // Collect all non-page components
  const nonPageComponents = componentFiles.filter((f) => f !== pageFile);

  // Build component scripts
  const componentScripts = nonPageComponents
    .map((f) => {
      const cleaned = stripForPreview(f.content);
      return `// --- ${f.path} ---\n${cleaned}`;
    })
    .join("\n\n");

  // Build page script
  let pageCode = "";
  if (pageFile) {
    let cleaned = stripForPreview(pageFile.content);
    // Rename the default function to App
    cleaned = cleaned.replace(/^function\s+\w+/m, "function App");
    pageCode = cleaned;
  } else {
    pageCode = `function App() { return React.createElement("div", {style:{padding:"2rem",textAlign:"center"}}, "No page.tsx found in workspace"); }`;
  }

  // Extract custom colors from tailwind config for inline style overrides
  let customCssVars = "";
  if (tailwindConfig) {
    // Extract color definitions
    const colorMatches = tailwindConfig.matchAll(/['"]?([\w-]+)['"]?\s*:\s*['"]([#\w(),.\/\s]+)['"]/g);
    const colors: Record<string, string> = {};
    for (const m of colorMatches) {
      if (m[2].startsWith("#") || m[2].startsWith("rgb")) {
        colors[m[1]] = m[2];
      }
    }
    // Generate CSS custom properties and Tailwind-like utility classes
    const colorEntries = Object.entries(colors);
    if (colorEntries.length > 0) {
      customCssVars = colorEntries
        .map(([name, value]) => {
          return [
            `.bg-${name} { background-color: ${value}; }`,
            `.text-${name} { color: ${value}; }`,
            `.border-${name} { border-color: ${value}; }`,
            `.ring-${name} { --tw-ring-color: ${value}; }`,
          ].join("\n");
        })
        .join("\n");
    }
  }

  // Extract additional CSS from globals (skip @tailwind directives and @apply)
  let extraCss = "";
  if (globalsCss) {
    extraCss = globalsCss.content
      .replace(/@tailwind\s+\w+;/g, "")
      .replace(/@apply\s+[^;]+;/g, "")
      .trim();
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  ${tailwindConfig ? `<script>
    tailwind.config = (function() {
      ${tailwindConfig
        .replace(/import\s+.*;\s*/g, "")
        .replace(/export\s+default\s+/, "return ")
        .replace(/import\s+type\s+.*;\s*/g, "")
        .replace(/:\s*Config\s*/, "")}
    })();
  <\/script>` : ""}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Merriweather:wght@300;400;700;900&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', sans-serif; }
    img { max-width: 100%; height: auto; }
    ${extraCss}
    ${customCssVars}
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script>
    // Polyfill for cn() utility
    function cn() {
      var result = [];
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        if (Array.isArray(arg)) result = result.concat(arg.filter(Boolean));
        else if (arg) result.push(arg);
      }
      return result.join(' ');
    }

    // Source code to compile
    var sourceCode = ${JSON.stringify(componentScripts + "\n\n" + pageCode + "\n\nvar root = ReactDOM.createRoot(document.getElementById('root'));\nroot.render(React.createElement(App));")};

    try {
      var result = Babel.transform(sourceCode, {
        presets: [['react', { runtime: 'classic' }]],
        filename: 'preview.jsx'
      });
      var script = document.createElement('script');
      script.textContent = result.code;
      document.body.appendChild(script);
    } catch(e) {
      document.getElementById('root').innerHTML = '<pre style="color:red;padding:1rem;font-size:12px;white-space:pre-wrap">' + e.message + '</pre>';
      console.error('Babel compilation error:', e);
    }
  <\/script>
</body>
</html>`;
}

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PreviewState["status"]>("idle");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const logHistoryRef = useRef<string>("");
  const logListenersRef = useRef<Set<LogListener>>(new Set());

  const log = useCallback((text: string) => {
    const line = text + "\r\n";
    logHistoryRef.current += line;
    logListenersRef.current.forEach((l) => l(line));
  }, []);

  const getTerminalHistory = useCallback(() => logHistoryRef.current, []);

  const onTerminalData = useCallback((listener: LogListener) => {
    logListenersRef.current.add(listener);
    return () => { logListenersRef.current.delete(listener); };
  }, []);

  const stopPreview = useCallback(() => {
    setIsRunning(false);
    setPreviewHtml(null);
    setStatus("idle");
    log("Preview stopped.");
  }, [log]);

  const runPreview = useCallback(
    async (files: WorkspaceFile[], projectId: string) => {
      if (isRunning) return;
      setIsRunning(true);
      setStatus("building");
      setError(null);
      logHistoryRef.current = "";
      logListenersRef.current.forEach((l) => l("\x1bc"));

      log("Loading workspace files...");
      try {
        const srcFiles = files.filter(
          (f) =>
            !f.is_dir &&
            !f.path.startsWith(".git") &&
            !f.path.startsWith("node_modules") &&
            (f.path.endsWith(".tsx") ||
              f.path.endsWith(".jsx") ||
              f.path.endsWith(".ts") ||
              f.path.endsWith(".js") ||
              f.path.endsWith(".css") ||
              f.path.endsWith(".json"))
        );

        log(`Found ${srcFiles.length} source files. Fetching content...`);

        const fileContents = await Promise.all(
          srcFiles.map((f) =>
            readWorkspaceFile(projectId, f.path).catch(() => ({
              path: f.path,
              content: "",
            }))
          )
        );

        log(`Fetched ${fileContents.length} files.`);

        // Find tailwind config
        const twConfig = (fileContents as FileContent[]).find(
          (f) =>
            f.path === "tailwind.config.ts" || f.path === "tailwind.config.js"
        );

        log("Building preview HTML with CDN dependencies...");
        log("  ✓ React 18 (from unpkg CDN)");
        log("  ✓ Tailwind CSS (from CDN)");
        log("  ✓ Babel Standalone (JSX compilation)");
        log("  ✓ Google Fonts (Inter, Merriweather)");

        const html = buildPreviewHtml(
          fileContents as FileContent[],
          twConfig?.content ?? null
        );

        setPreviewHtml(html);
        setStatus("ready");
        log("");
        log("✅ Preview built successfully! Rendering in iframe...");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus("error");
        setIsRunning(false);
        log(`❌ Error: ${msg}`);
      }
    },
    [isRunning, log]
  );

  return (
    <PreviewCtx.Provider
      value={{
        status,
        previewHtml,
        error,
        isRunning,
        runPreview,
        stopPreview,
        getTerminalHistory,
        onTerminalData,
      }}
    >
      {children}
    </PreviewCtx.Provider>
  );
}

export function usePreview() {
  const ctx = useContext(PreviewCtx);
  if (!ctx)
    throw new Error("usePreview must be used within PreviewProvider");
  return ctx;
}

// Keep backward compat exports
export const WebContainerProvider = PreviewProvider;
export const useWebContainer = usePreview;
