import { NextResponse } from "next/server";
import { getApiKeyById, rotateApiKey } from "@/lib/localDb";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const key = await rotateApiKey(id, { type: body.actorType || null, id: body.actorId || null });
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error rotating key:", error);
    return NextResponse.json({ error: "Failed to rotate key" }, { status: 500 });
  }
}
