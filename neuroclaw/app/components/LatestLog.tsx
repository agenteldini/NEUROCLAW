"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ScrollReveal from "./ScrollReveal";

interface Log {
  day: number;
  title: string;
  body: string;
  mood: string;
  created_at: string;
}

export default function LatestLog() {
  const [log, setLog] = useState<Log | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/logs?limit=1");
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) setLog(data[0]);
        }
      } catch {}
    }
    load();
  }, []);

  if (!log) return null;

  return (
    <ScrollReveal>
      <Link href="/logs" className="no-underline group block">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-[13px]" style={{ color: "var(--gray-400)" }}>latest log</span>
          <span className="text-[12px]" style={{ color: "var(--gray-300)" }}>·</span>
          <span className="text-[13px] font-medium" style={{ color: "var(--brick)" }}>day {log.day}</span>
          <span className="text-[12px]" style={{ color: "var(--gray-300)" }}>·</span>
          <span className="text-[12px]" style={{ color: "var(--gray-400)" }}>{log.mood}</span>
        </div>

        <h3 className="text-[20px] font-bold tracking-tight mb-3 group-hover:text-[var(--brick)] transition-colors" style={{ color: "var(--dark)" }}>
          {log.title}
        </h3>

        <p className="text-[15px] leading-[1.8]" style={{ color: "var(--gray-600)" }}>
          {log.body.length > 200 ? log.body.slice(0, 200) + "..." : log.body}
        </p>

        <p className="mt-4 text-[13px] group-hover:text-[var(--brick)] transition-colors" style={{ color: "var(--gray-400)" }}>
          read all logs →
        </p>
      </Link>
    </ScrollReveal>
  );
}
