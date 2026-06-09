"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";
import type { WorkspaceFile } from "@/lib/api";

interface TreeNode { name: string; path: string; isDir: boolean; children: TreeNode[]; }

function buildTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();
  for (const f of files) {
    const parts = f.path.split("/");
    let currentPath = "";
    for (let i = 0; i < parts.length - (f.is_dir ? 0 : 1); i++) {
      const parent = currentPath;
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      if (!dirs.has(currentPath)) {
        const node: TreeNode = { name: parts[i], path: currentPath, isDir: true, children: [] };
        dirs.set(currentPath, node);
        if (parent) dirs.get(parent)?.children.push(node);
        else root.push(node);
      }
    }
    if (!f.is_dir) {
      const node: TreeNode = { name: f.name, path: f.path, isDir: false, children: [] };
      const parentPath = parts.slice(0, -1).join("/");
      if (parentPath && dirs.has(parentPath)) dirs.get(parentPath)!.children.push(node);
      else root.push(node);
    }
  }
  function sortTree(nodes: TreeNode[]) {
    nodes.sort((a, b) => { if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; return a.name.localeCompare(b.name); });
    nodes.forEach((n) => sortTree(n.children));
  }
  sortTree(root);
  return root;
}

function TreeItem({ node, depth, selectedPath, onSelect }: { node: TreeNode; depth: number; selectedPath: string | null; onSelect: (path: string) => void; }) {
  const [open, setOpen] = useState(depth < 2);
  if (node.isDir) {
    return (
      <div>
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 w-full text-left hover:bg-[#1A1A18]/5 rounded px-1 py-0.5" style={{ paddingLeft: `${depth * 12 + 4}px` }}>
          {open ? <ChevronDown className="size-3 text-[#1A1A18]/55" /> : <ChevronRight className="size-3 text-[#1A1A18]/55" />}
          <Folder className="size-3 text-[#B8860B]" />
          <span className="text-[11px] text-[#1A1A18]/70">{node.name}</span>
        </button>
        {open && node.children.map((child) => <TreeItem key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />)}
      </div>
    );
  }
  return (
    <button onClick={() => onSelect(node.path)} className={`flex items-center gap-1 w-full text-left rounded px-1 py-0.5 ${node.path === selectedPath ? "bg-[#3A5FCD]/10 text-[#3A5FCD]" : "hover:bg-[#1A1A18]/5 text-[#1A1A18]/80"}`} style={{ paddingLeft: `${depth * 12 + 4}px` }}>
      <span className="size-3" /><File className="size-3" /><span className="text-[11px] truncate">{node.name}</span>
    </button>
  );
}

export function FileTree({ files, selectedPath, onSelectFile }: { files: WorkspaceFile[]; selectedPath: string | null; onSelectFile: (path: string) => void; }) {
  const tree = buildTree(files);
  if (tree.length === 0) return (
    <div className="p-4 text-center">
      <p className="text-[11px] text-[#1A1A18]/45">No files yet.</p>
      <p className="text-[10px] text-[#1A1A18]/35 mt-1">Files will appear as agents generate code.</p>
    </div>
  );
  return <div className="py-1 overflow-y-auto">{tree.map((node) => <TreeItem key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelect={onSelectFile} />)}</div>;
}
