import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data: memories } = await getSupabaseAdmin()
    .from("memories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ memories: memories || [] });
}
