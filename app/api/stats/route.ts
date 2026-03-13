import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const { data: state } = await getSupabase()
    .from("agent_state")
    .select("*")
    .single();

  if (!state) {
    return NextResponse.json({ error: "no state" }, { status: 500 });
  }

  const born = new Date(state.born_at);
  const now = new Date();
  const daysAlive =
    Math.floor((now.getTime() - born.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  return NextResponse.json({
    days_alive: daysAlive,
    total_memories: state.total_memories,
    total_inputs: state.total_inputs,
    total_logs: state.total_logs,
    last_thought_at: state.last_thought_at,
    born_at: state.born_at,
  });
}
