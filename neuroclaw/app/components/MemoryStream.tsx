"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Memory {
  id: number;
  content: string;
  created_at: string;
}

function timeAgo(date: string) {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function MemoryStream() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/memories")
      .then((r) => r.json())
      .then((data) => {
        setMemories(data.memories || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const iv = setInterval(() => {
      fetch("/api/memories")
        .then((r) => r.json())
        .then((data) => setMemories(data.memories || []))
        .catch(() => {});
    }, 60000);

    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return (
      <div className="py-6 text-center text-[14px]" style={{ color: "var(--gray-400)" }}>
        loading memories...
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="py-6 text-center text-[14px]" style={{ color: "var(--gray-400)" }}>
        no memories yet — waiting for first thought
      </div>
    );
  }

  return (
    <div>
      <AnimatePresence mode="popLayout">
        {memories.slice(0, 8).map((m, i) => (
          <motion.div
            key={m.id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: i === 0 ? 1 : 0.35, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="py-3"
            style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}
          >
            <span className="text-[14px]" style={{ color: "var(--dark)" }}>
              {m.content}
            </span>
            <span
              className="text-[13px] ml-3"
              style={{ color: "var(--gray-300)" }}
            >
              {timeAgo(m.created_at)}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
