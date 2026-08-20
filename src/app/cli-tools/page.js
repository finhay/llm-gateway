import { getMachineId } from "@/shared/utils/machine";
import CLIToolsPageClient from "../(dashboard)/dashboard/cli-tools/CLIToolsPageClient";

// Public mirror of /dashboard/cli-tools without the sidebar/header chrome —
// meant to be shared with people who don't have a dashboard login.
export default async function PublicCLIToolsPage() {
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
        <CLIToolsPageClient machineId={machineId} basePath="/cli-tools" />
      </main>
    </div>
  );
}
