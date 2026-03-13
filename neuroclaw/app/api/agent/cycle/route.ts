import { NextResponse } from "next/server";
import { runCycle } from "@/lib/soloclaw";

export const maxDuration = 60;

async function handleCycle() {
  try {
    const result = await runCycle();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return handleCycle();
}

export async function POST() {
  return handleCycle();
}
