import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import OrganizationToolSetup from "../OrganizationToolSetup";
import CliToolsHeader from "../CliToolsHeader";

// Public member setup flow. It never calls the server-side host configuration APIs.
export default async function PublicToolDetailPage({ params }) {
  const { toolId } = await params;
  if (!CLI_TOOLS[toolId]) notFound();
  const requestHeaders = await headers();
  const protocol = (requestHeaders.get("x-forwarded-proto") || "http").split(",")[0].trim();
  const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "").split(",")[0].trim();
  const gatewayOrigin = host ? `${protocol}://${host}` : "";

  return (
    <div className="min-h-screen w-full bg-bg">
      <CliToolsHeader />
      <main className="px-6 py-8 lg:px-10">
        <OrganizationToolSetup toolId={toolId} gatewayOrigin={gatewayOrigin} />
      </main>
    </div>
  );
}
