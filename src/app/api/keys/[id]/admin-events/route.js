import { NextResponse } from "next/server";
import { getApiKeyAdminEvents, getApiKeyById } from "@/lib/localDb";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });

    const limit = Number(new URL(request.url).searchParams.get("limit") || 100);
    const events = await getApiKeyAdminEvents(id, limit);
    return NextResponse.json({ events });
  } catch (error) {
    console.log("Error fetching key admin events:", error);
    return NextResponse.json({ error: "Failed to fetch key admin events" }, { status: 500 });
  }
}
