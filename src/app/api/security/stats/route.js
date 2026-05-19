import { NextResponse } from "next/server";
import { getSecurityEventStats } from "@/lib/localDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get("days"), 10) || 7, 1), 90);
    const stats = await getSecurityEventStats(days * 86400000);
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
