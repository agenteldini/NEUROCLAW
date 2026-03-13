"use client";

import { motion } from "framer-motion";

export default function Pulse() {
  return (
    <div className="relative inline-flex items-center justify-center w-3 h-3">
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: "var(--brick)" }}
        animate={{
          scale: [1, 2.5, 1],
          opacity: [0.4, 0, 0.4],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
      />
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--brick)" }} />
    </div>
  );
}
