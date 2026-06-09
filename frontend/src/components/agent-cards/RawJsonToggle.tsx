"use client";

import { useState } from "react";

export function RawJsonToggle({ data }: { data: unknown }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mt-2 pt-2 border-t border-[#1A1A18]/5">
      <button
        onClick={() => setShow(!show)}
        className="text-[10px] text-[#1A1A18]/45 hover:text-[#1A1A18]/70"
      >
        {show ? "Hide raw JSON" : "View raw JSON"}
      </button>
      {show && (
        <pre className="mt-1 p-2 rounded bg-[#1A1A18]/5 overflow-auto max-h-40 text-[10px] text-[#1A1A18]/70">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
