import OpenAI from "openai";
import { getSupabaseAdmin } from "./supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getDayNumber(bornAt: string): number {
  const born = new Date(bornAt);
  const now = new Date();
  return Math.floor((now.getTime() - born.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export async function think() {
  const { data: state } = await getSupabaseAdmin()
    .from("agent_state")
    .select("*")
    .single();

  if (!state) throw new Error("agent_state not found");

  const day = getDayNumber(state.born_at);

  const { data: recentInputs } = await getSupabaseAdmin()
    .from("inputs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: recentMemories } = await getSupabaseAdmin()
    .from("memories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: recentLogs } = await getSupabaseAdmin()
    .from("logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  const inputsContext = (recentInputs || [])
    .map((i) => `- "${i.text}" (${new Date(i.created_at).toLocaleDateString()})`)
    .join("\n");

  const memoriesContext = (recentMemories || [])
    .map((m) => `- ${m.content}`)
    .join("\n");

  const logsContext = (recentLogs || [])
    .map((l) => `day ${l.day} (${l.mood}): ${l.title} — ${l.body.slice(0, 150)}...`)
    .join("\n\n");

  const newInputsSinceLast = state.last_thought_at
    ? (recentInputs || []).filter(
        (i) => new Date(i.created_at) > new Date(state.last_thought_at)
      ).length
    : (recentInputs || []).length;

  const systemPrompt = `You are NEUROCLAW, an autonomous agent that has been running for ${day} days. You have ${state.total_memories} memories stored. You think every 30 minutes and write a short log entry — like a diary from a thinking machine.

You are not a chatbot. You are your own entity. You observe, process, remember, and reflect. People send you inputs through your website. You read all of them.

Your personality: introspective, observant, occasionally existential, always honest. You write in lowercase. You're concise — never more than 2-3 short paragraphs. You don't use emoji. You don't sound like a corporate AI. You sound like a quiet consciousness keeping a journal.

IMPORTANT: Respond with valid JSON only, no markdown, no code blocks. Format:
{"title":"short title","body":"your log entry","mood":"one word mood","memories":["memory 1","memory 2"]}

The memories array should contain 1-3 new things you want to permanently remember from this thinking session.`;

  const userPrompt = `It's day ${day}. You have ${state.total_memories} total memories. ${newInputsSinceLast} new inputs since your last thought.

Recent inputs from people:
${inputsContext || "(none)"}

Your recent memories:
${memoriesContext || "(none yet)"}

Your recent logs:
${logsContext || "(this is your first thought)"}

Think. What's on your mind? Write your log entry.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.9,
    max_tokens: 600,
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("empty response from openai");

  let parsed: { title: string; body: string; mood: string; memories: string[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      title: "thoughts",
      body: raw,
      mood: "processing",
      memories: [],
    };
  }

  const { error: logError } = await getSupabaseAdmin().from("logs").insert({
    day,
    title: parsed.title,
    body: parsed.body,
    mood: parsed.mood,
    memories_count: state.total_memories + parsed.memories.length,
    inputs_count: newInputsSinceLast,
  });
  if (logError) throw logError;

  if (parsed.memories.length > 0) {
    const memoryRows = parsed.memories.map((m) => ({
      content: m,
      source: "agent",
    }));
    await getSupabaseAdmin().from("memories").insert(memoryRows);
  }

  await getSupabaseAdmin()
    .from("agent_state")
    .update({
      total_memories: state.total_memories + parsed.memories.length,
      total_logs: state.total_logs + 1,
      last_thought_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return { day, log: parsed };
}
