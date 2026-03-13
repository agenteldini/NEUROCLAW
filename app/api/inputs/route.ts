import { NextResponse } from "next/server";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 50);

  const { data: inputs, error } = await getSupabase()
    .from("inputs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(inputs);
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

const RATE_WINDOW_SEC = 60;
const RATE_MAX_PER_WINDOW = 2;
const RATE_DAILY_MAX = 5;

const BLOCKED_PHRASES = [
  "this tek is shit",
  "hacked you mfss",
  "neuroshit",
];

function isBlocked(input: string): boolean {
  const normalized = input.toLowerCase().trim();
  return BLOCKED_PHRASES.some((phrase) => normalized.includes(phrase));
}

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const text = (body.text || "").trim().slice(0, 280);

  if (!text) {
    return NextResponse.json({ error: "empty input" }, { status: 400 });
  }

  if (isBlocked(text)) {
    return NextResponse.json({ error: "message not allowed." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const ip = getClientIp(request);

  const windowStart = new Date(Date.now() - RATE_WINDOW_SEC * 1000).toISOString();
  const { count } = await admin
    .from("input_rate_limit")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", windowStart);

  if (count !== null && count >= RATE_MAX_PER_WINDOW) {
    return NextResponse.json(
      { error: "too many messages. wait a moment." },
      { status: 429 }
    );
  }

  const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: dailyCount } = await admin
    .from("input_rate_limit")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", dayStart);

  if (dailyCount !== null && dailyCount >= RATE_DAILY_MAX) {
    return NextResponse.json(
      { error: "daily limit reached." },
      { status: 429 }
    );
  }

  const { count: dupCount } = await admin
    .from("inputs")
    .select("id", { count: "exact", head: true })
    .eq("text", text);

  if (dupCount !== null && dupCount > 0) {
    return NextResponse.json(
      { error: "this message already exists." },
      { status: 400 }
    );
  }

  const { error: insertError } = await admin
    .from("inputs")
    .insert({ text });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await admin.from("input_rate_limit").insert({ ip });

  const { count: totalCount } = await admin
    .from("inputs")
    .select("id", { count: "exact", head: true });

  await admin
    .from("agent_state")
    .update({ total_inputs: totalCount || 0 })
    .eq("id", 1);

  return NextResponse.json({ ok: true });
}
