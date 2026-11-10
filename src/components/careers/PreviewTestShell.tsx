import { isPreviewTestMode } from "@/lib/preview-mode";
import { PreviewTestBanner } from "./PreviewTestBanner";

/** Server wrapper. The preview flag is a prop, not a NEXT_PUBLIC_ variable. */
export function PreviewTestShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PreviewTestBanner enabled={isPreviewTestMode()} />
      {children}
    </>
  );
}
