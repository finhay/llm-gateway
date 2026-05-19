import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, revokeApiKey, updateApiKey } from "@/lib/localDb";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updateData = {};
    for (const field of [
      "name",
      "scopes",
      "allowedProviders",
      "ownerType",
      "ownerId",
      "expiresAt",
      "rateLimitRpm",
      "rateLimitRpd",
      "budgetLimitUsd",
      "budgetPeriod",
      "isActive",
      "status",
      "metadata",
      "updatedBy",
      "actorType",
      "revokeReason",
    ]) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    const updated = await updateApiKey(id, updateData);
    return NextResponse.json({ key: updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const key = body.reason
      ? await revokeApiKey(id, { type: body.actorType || null, id: body.actorId || null }, body.reason)
      : ((await deleteApiKey(id)) ? await getApiKeyById(id) : null);

    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Key revoked successfully", key });
  } catch (error) {
    console.log("Error revoking key:", error);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
}
