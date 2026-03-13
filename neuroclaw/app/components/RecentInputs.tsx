"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ScrollReveal from "./ScrollReveal";

interface Input {
  id: number;
  text: string;
  created_at: string;
}

export default function RecentInputs() {
  const [inputs, setInputs] = useState<Input[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/inputs?limit=5");
        if (res.ok) setInputs(await res.json());
      } catch {}
    }
    load();
  }, []);

  if (inputs.length === 0) return null;

  return (
    <>
      <ScrollReveal>
        <div className="flex items-center justify-between mb-8">
          <span className="text-[13px]" style={{ color: "var(--gray-400)" }}>recent inputs from people</span>
          <Link href="/input" className="text-[13px] no-underline hover:text-[var(--brick)] transition-colors" style={{ color: "var(--gray-400)" }}>
            see all →
          </Link>
        </div>
      </ScrollReveal>

      {inputs.map((inp, i) => (
        <ScrollReveal key={inp.id} delay={i * 0.05}>
          <div className="py-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
            <p className="text-[15px]" style={{ color: i === 0 ? "var(--dark)" : "var(--gray-500)" }}>
              &ldquo;{inp.text}&rdquo;
            </p>
          </div>
        </ScrollReveal>
      ))}

      <ScrollReveal delay={0.3}>
        <Link
          href="/input"
          className="inline-block mt-8 text-[14px] font-medium no-underline px-6 py-3 rounded-full transition-opacity hover:opacity-80"
          style={{ background: "var(--brick)", color: "white" }}
        >
          send a message →
        </Link>
      </ScrollReveal>
    </>
  );
}
