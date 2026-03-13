"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: number;
  text: string;
  created_at: string;
  isYou?: boolean;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function InputWall() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/inputs?limit=30");
        if (res.ok) setMessages(await res.json());
      } catch {}
    }
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  async function handleSend() {
    if (!input.trim() || sending) return;
    setSending(true);

    try {
      const res = await fetch("/api/inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.trim() }),
      });

      if (res.ok) {
        const newMsg: Message = {
          id: Date.now(),
          text: input.trim(),
          created_at: new Date().toISOString(),
          isYou: true,
        };
        setMessages((prev) => [newMsg, ...prev]);
        setInput("");
        setSent(true);
        setTimeout(() => setSent(false), 3000);
      }
    } catch {}

    setSending(false);
  }

  return (
    <div>
      <div className="mb-12">
        <div className="flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 280))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="say something..."
            rows={2}
            className="flex-1 bg-transparent border-b outline-none text-[15px] pb-2 placeholder:text-[var(--gray-300)] resize-none"
            style={{
              borderColor: "var(--gray-200)",
              color: "var(--dark)",
              caretColor: "var(--brick)",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending}
            className="text-[14px] font-medium pb-2 cursor-pointer transition-colors disabled:opacity-40"
            style={{ color: input.trim() ? "var(--brick)" : "var(--gray-300)" }}
          >
            {sending ? "..." : "send"}
          </button>
        </div>
        <div className="flex justify-between mt-2">
          <p className="text-[12px]" style={{ color: "var(--gray-300)" }}>
            {sent ? "received. neuroclaw will remember this." : "280 characters. neuroclaw reads everything."}
          </p>
          <span className="text-[12px]" style={{ color: input.length > 260 ? "var(--brick)" : "var(--gray-300)" }}>
            {input.length}/280
          </span>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="py-4"
            style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}
          >
            <p className="text-[15px] leading-relaxed" style={{ color: msg.isYou ? "var(--brick)" : "var(--dark)" }}>
              {msg.text}
            </p>
            <div className="flex gap-3 mt-1.5">
              <span className="text-[12px]" style={{ color: "var(--gray-300)" }}>
                {timeAgo(msg.created_at)}
              </span>
              {msg.isYou && (
                <span className="text-[12px]" style={{ color: "var(--brick)" }}>you</span>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
