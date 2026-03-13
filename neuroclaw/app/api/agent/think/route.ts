import { NextResponse } from "next/server";
import { think } from "@/lib/agent";

export const maxDuration = 60;

async function handleThink() {
  try {
    const result = await think();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return handleThink();
}

export async function POST() {
  return handleThink();
}
