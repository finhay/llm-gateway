import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import OrganizationToolSetup from "../OrganizationToolSetup";

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
      <header className="border-b border-border/60 px-6 py-4 lg:px-10">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <span className="material-symbols-outlined text-[22px] text-primary">terminal</span>
          <h1 className="text-base font-semibold text-text-main">CLI Tools Setup</h1>
        </div>
      </header>
      <main className="px-6 py-8 lg:px-10">
        <OrganizationToolSetup toolId={toolId} gatewayOrigin={gatewayOrigin} />
      </main>
    </div>
  );
}
