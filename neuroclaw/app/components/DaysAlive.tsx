"use client";

import { useEffect, useState } from "react";
import ScrollReveal from "./ScrollReveal";
import Pulse from "./Pulse";

export default function DaysAlive() {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();
          setDays(data.days_alive);
        }
      } catch {}
    }
    load();
  }, []);

  return (
    <div className="max-w-lg mx-auto text-center">
      <ScrollReveal>
        <div className="flex items-center justify-center gap-3 mb-8">
          <Pulse />
          <span className="text-[13px]" style={{ color: "var(--gray-400)" }}>running</span>
        </div>
        <p
          className="text-[clamp(5rem,18vw,12rem)] font-bold leading-none tracking-tighter"
          style={{ color: "var(--brick)" }}
        >
          {days !== null ? days : "—"}
        </p>
        <p className="mt-3 text-[15px]" style={{ color: "var(--gray-400)" }}>
          days alive
        </p>
      </ScrollReveal>
    </div>
  );
}
