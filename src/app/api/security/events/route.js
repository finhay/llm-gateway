import { NextResponse } from "next/server";
import { getSecurityEvents } from "@/lib/localDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const events = await getSecurityEvents({
      kind: searchParams.get("kind") || undefined,
      type: searchParams.get("type") || undefined,
      action: searchParams.get("action") || undefined,
      apiKey: searchParams.get("apiKey") || undefined,
      since: searchParams.get("since") || undefined,
      limit: searchParams.get("limit") || undefined,
    });
    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
