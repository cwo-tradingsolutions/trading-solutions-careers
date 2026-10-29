"use client";

import { useLanguage } from "@/i18n/context";

export function PreviewTestBanner({ enabled }: { enabled: boolean }) {
  const { t } = useLanguage();
  if (!enabled) return null;
  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 80,
        background: "#111111",
        color: "#ffffff",
        textAlign: "center",
        padding: "10px 16px",
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1.4,
        fontFamily: '"Open Sauce Two", "Noto Sans SC", Inter, sans-serif',
      }}
    >
      {t.ui.previewTestBanner}
    </div>
  );
}
