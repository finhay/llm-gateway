import { NextResponse } from "next/server";
import { getApiKeyById, getApiKeyUsageEvents } from "@/lib/localDb";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });

    const limit = Number(new URL(request.url).searchParams.get("limit") || 100);
    const events = await getApiKeyUsageEvents(id, limit);
    return NextResponse.json({ events });
  } catch (error) {
    console.log("Error fetching key usage events:", error);
    return NextResponse.json({ error: "Failed to fetch key usage events" }, { status: 500 });
  }
}
