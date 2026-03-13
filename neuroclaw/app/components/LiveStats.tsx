"use client";

import { useEffect, useState } from "react";

interface Stats {
  days_alive: number;
  total_memories: number;
  total_inputs: number;
}

export default function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) setStats(await res.json());
      } catch {}
    }
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  const s = stats || { total_memories: 0, total_inputs: 0 };

  return (
    <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-20 sm:gap-10 text-center">
      <div>
        <p className="text-[clamp(3rem,8vw,5rem)] font-bold tracking-tighter" style={{ color: "var(--dark)" }}>
          {s.total_memories.toLocaleString()}
        </p>
        <p className="mt-1 text-[14px]" style={{ color: "var(--gray-400)" }}>memories</p>
      </div>
      <div>
        <p className="text-[clamp(3rem,8vw,5rem)] font-bold tracking-tighter" style={{ color: "var(--dark)" }}>
          {s.total_inputs.toLocaleString()}
        </p>
        <p className="mt-1 text-[14px]" style={{ color: "var(--gray-400)" }}>inputs received</p>
      </div>
      <div>
        <p className="text-[clamp(3rem,8vw,5rem)] font-bold tracking-tighter" style={{ color: "var(--brick)" }}>
          0
        </p>
        <p className="mt-1 text-[14px]" style={{ color: "var(--gray-400)" }}>things forgotten</p>
      </div>
    </div>
  );
}
