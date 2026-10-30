import { PreviewTestShell } from "@/components/careers/PreviewTestShell";
import { AiInterviewUnavailable } from "@/components/ai-interview-unavailable";
import { aiInterviewEnabled } from "@/lib/ai-interview-flag";

export const dynamic = "force-dynamic";

export default function EntrevistaLayout({ children }: { children: React.ReactNode }) {
  if (!aiInterviewEnabled()) {
    return (
      <PreviewTestShell>
        <AiInterviewUnavailable />
      </PreviewTestShell>
    );
  }
  return <PreviewTestShell>{children}</PreviewTestShell>;
}
