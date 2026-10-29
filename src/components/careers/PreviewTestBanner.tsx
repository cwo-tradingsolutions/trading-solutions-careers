"use client";

import { useLanguage } from "@/i18n/context";

export function PreviewTestBanner({ enabled }: { enabled: boolean }) {
  const { t } = useLanguage();
  if (!enabled) return null;
  return (
    <div className="ts-preview-banner" role="status">
      {t.ui.previewTestBanner}
    </div>
  );
}
