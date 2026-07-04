import { AgentChat } from "@/app/_components/agent-chat";
import { RunRail } from "./run-rail";

export default function StudioPage() {
  return (
    <main className="grid h-dvh overflow-hidden bg-zap-ink xl:grid-cols-[minmax(0,1fr)_360px]">
      <AgentChat />
      <RunRail />
    </main>
  );
}
