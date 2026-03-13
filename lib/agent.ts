import { getSupabaseAdmin } from "./supabase";

const KIE_URL = "https://api.kie.ai/gpt-5-2/v1/chat/completions";

function getDayNumber(bornAt: string): number {
  const born = new Date(bornAt);
  const now = new Date();
  return Math.floor((now.getTime() - born.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

async function callGPT(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(KIE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.KIE_API_KEY}`,
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({
        role: m.role,
        content: [{ type: "text", text: m.content }],
      })),
      stream: false,
      reasoning_effort: "low",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`kie.ai error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.delta?.content || "";
}

export async function think() {
  const db = getSupabaseAdmin();

  const { data: state } = await db.from("agent_state").select("*").single();
  if (!state) throw new Error("agent_state not found");

  const day = getDayNumber(state.born_at);

  const { data: recentInputs } = await db
    .from("inputs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: recentMemories } = await db
    .from("memories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: recentLogs } = await db
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

  const raw = await callGPT([
    { role: "developer", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  if (!raw) throw new Error("empty response from kie.ai");

  let parsed: { title: string; body: string; mood: string; memories: string[] };
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      title: "thoughts",
      body: raw,
      mood: "processing",
      memories: [],
    };
  }

  const { error: logError } = await db.from("logs").insert({
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
    await db.from("memories").insert(memoryRows);
  }

  await db
    .from("agent_state")
    .update({
      total_memories: state.total_memories + parsed.memories.length,
      total_logs: state.total_logs + 1,
      last_thought_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return { day, log: parsed };
}
