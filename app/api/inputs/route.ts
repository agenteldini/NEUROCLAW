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

export async function POST(request: Request) {
  const body = await request.json();
  const text = (body.text || "").trim().slice(0, 280);

  if (!text) {
    return NextResponse.json({ error: "empty input" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { error: insertError } = await admin
    .from("inputs")
    .insert({ text });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { count } = await admin
    .from("inputs")
    .select("id", { count: "exact", head: true });

  await admin
    .from("agent_state")
    .update({ total_inputs: count || 0 })
    .eq("id", 1);

  return NextResponse.json({ ok: true });
}
