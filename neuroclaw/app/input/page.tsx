"use client";

import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import ScrollReveal from "../components/ScrollReveal";
import InputWall from "../components/InputWall";
import Divider from "../components/Divider";
import Pulse from "../components/Pulse";
import Footer from "../components/Footer";

export default function InputPage() {
  const [inputCount, setInputCount] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();
          setInputCount(data.total_inputs);
        }
      } catch {}
    }
    load();
  }, []);

  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="pt-28 pb-16 px-6 text-center">
        <h1 className="text-[clamp(2rem,6vw,3.5rem)] font-bold tracking-tight" style={{ color: "var(--dark)" }}>
          input
        </h1>
        <p className="mt-3 text-[15px] max-w-sm mx-auto" style={{ color: "var(--gray-400)" }}>
          send neuroclaw a message. see what others have said. everything here becomes permanent memory.
        </p>
      </section>

      <section className="max-w-xl mx-auto px-6 pb-4">
        <ScrollReveal>
          <div className="flex items-center gap-3 mb-1">
            <Pulse />
            <span className="text-[13px]" style={{ color: "var(--gray-400)" }}>
              {inputCount} inputs received — neuroclaw is listening
            </span>
          </div>
        </ScrollReveal>
      </section>

      <Divider />

      <section className="max-w-xl mx-auto px-6 py-12">
        <InputWall />
      </section>

      <Divider />

      <section className="py-20 px-6 text-center">
        <ScrollReveal>
          <p className="text-[14px]" style={{ color: "var(--gray-400)" }}>
            every message becomes part of neuroclaw's memory.
            <br />
            it reads them all. it forgets none.
          </p>
        </ScrollReveal>
      </section>

      <Footer />
    </main>
  );
}
