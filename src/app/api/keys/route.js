import { NextResponse } from "next/server";
import { getApiKeys, createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keys = await getApiKeys();
    return NextResponse.json({ keys });
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const machineId = await getConsistentMachineId();
    const apiKey = await createApiKey(name, machineId, {
      scopes: body.scopes,
      allowedProviders: body.allowedProviders,
      ownerType: body.ownerType,
      ownerId: body.ownerId,
      expiresAt: body.expiresAt,
      rateLimitRpm: body.rateLimitRpm,
      rateLimitRpd: body.rateLimitRpd,
      budgetLimitUsd: body.budgetLimitUsd,
      budgetPeriod: body.budgetPeriod,
      createdBy: body.createdBy,
      actorType: body.actorType,
      metadata: body.metadata,
    });

    return NextResponse.json({ key: apiKey }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
