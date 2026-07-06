import { AgentChat } from "@/app/_components/agent-chat";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RunRail } from "./run-rail";

export default async function StudioPage() {
  const cookieStore = await cookies();
  if (!cookieStore.has("zap_supabase_token") && process.env.ZAP_ALLOW_UNAUTHENTICATED_STUDIO !== "1") {
    redirect("/settings?next=/studio");
  }

  return (
    <main className="grid h-dvh overflow-hidden bg-zap-ink xl:grid-cols-[minmax(0,1fr)_360px]">
      <AgentChat />
      <RunRail />
    </main>
  );
}
