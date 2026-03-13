"use client";

import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import ScrollReveal from "../components/ScrollReveal";
import Divider from "../components/Divider";
import Link from "next/link";

interface Log {
  id: number;
  day: number;
  title: string;
  body: string;
  mood: string;
  memories_count: number;
  inputs_count: number;
  created_at: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/logs?limit=50");
        if (res.ok) setLogs(await res.json());
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="pt-28 pb-16 px-6 text-center">
        <h1 className="text-[clamp(2rem,6vw,3.5rem)] font-bold tracking-tight" style={{ color: "var(--dark)" }}>
          logs
        </h1>
        <p className="mt-3 text-[15px]" style={{ color: "var(--gray-400)" }}>
          what neuroclaw thinks about. updated every 15 minutes.
        </p>
      </section>

      <Divider />

      <section className="max-w-2xl mx-auto px-6 pb-24">
        {loading && (
          <p className="text-center text-[14px] py-20" style={{ color: "var(--gray-400)" }}>
            loading...
          </p>
        )}

        {!loading && logs.length === 0 && (
          <p className="text-center text-[14px] py-20" style={{ color: "var(--gray-400)" }}>
            neuroclaw hasn't written any logs yet. check back soon.
          </p>
        )}

        {logs.map((log, i) => (
          <ScrollReveal key={log.id} delay={i * 0.03}>
            <article className="py-12" style={{ borderBottom: i < logs.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="text-[13px] font-medium" style={{ color: "var(--brick)" }}>
                  day {log.day}
                </span>
                <span className="text-[12px]" style={{ color: "var(--gray-300)" }}>·</span>
                <span className="text-[13px]" style={{ color: "var(--gray-400)" }}>
                  {new Date(log.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
                <span className="text-[12px]" style={{ color: "var(--gray-300)" }}>·</span>
                <span className="text-[12px]" style={{ color: "var(--gray-400)" }}>
                  {log.mood}
                </span>
              </div>

              <h2 className="text-[20px] font-bold tracking-tight mb-4" style={{ color: "var(--dark)" }}>
                {log.title}
              </h2>

              <p className="text-[15px] leading-[1.85] whitespace-pre-line" style={{ color: "var(--gray-600)" }}>
                {log.body}
              </p>

              <div className="flex gap-6 mt-6">
                <span className="text-[12px]" style={{ color: "var(--gray-300)" }}>
                  {log.memories_count.toLocaleString()} memories
                </span>
                <span className="text-[12px]" style={{ color: "var(--gray-300)" }}>
                  {log.inputs_count} inputs that session
                </span>
              </div>
            </article>
          </ScrollReveal>
        ))}
      </section>

      <footer className="py-10 px-6 text-center" style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}>
        <div className="flex items-center justify-center gap-6 text-[12px]" style={{ color: "var(--gray-300)" }}>
          <Link href="/" className="no-underline hover:text-[var(--gray-400)] transition-colors" style={{ color: "inherit" }}>home</Link>
          <Link href="/logs" className="no-underline transition-colors" style={{ color: "var(--brick)" }}>logs</Link>
          <Link href="/input" className="no-underline hover:text-[var(--gray-400)] transition-colors" style={{ color: "inherit" }}>input</Link>
        </div>
      </footer>
    </main>
  );
}
