import { notFound } from "next/navigation";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { getMachineId } from "@/shared/utils/machine";
import ToolDetailClient from "../../(dashboard)/dashboard/cli-tools/[toolId]/ToolDetailClient";

// Public mirror of /dashboard/cli-tools/[toolId] without the sidebar/header chrome.
export default async function PublicToolDetailPage({ params }) {
  const { toolId } = await params;
  if (!CLI_TOOLS[toolId]) notFound();
  const machineId = await getMachineId();

  return (
    <div className="min-h-screen w-full bg-bg">
      <header className="border-b border-border/60 px-6 py-4 lg:px-10">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <span className="material-symbols-outlined text-[22px] text-primary">terminal</span>
          <h1 className="text-base font-semibold text-text-main">CLI Tools Setup</h1>
        </div>
      </header>
      <main className="px-6 py-8 lg:px-10">
        <ToolDetailClient toolId={toolId} machineId={machineId} backHref="/cli-tools" />
      </main>
    </div>
  );
}
