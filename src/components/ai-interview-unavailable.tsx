"use client";

import { ATS_FROM_EMAIL } from "@/lib/ats-from";
import {
  AI_INTERVIEW_UNAVAILABLE_EN,
  AI_INTERVIEW_UNAVAILABLE_ES,
} from "@/lib/ai-interview-flag";

/** Candidate page when the voice interview is off. Names the team mailbox. */
export function AiInterviewUnavailable() {
  return (
    <main style={{ minHeight: "100vh", background: "#f4f5f7", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <section style={{ maxWidth: 560, background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 8px 30px rgba(15,23,42,0.06)" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", margin: 0 }}>Trading Solutions</p>
        <h1 style={{ fontSize: 28, lineHeight: 1.2, margin: "12px 0" }}>Entrevista no disponible</h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#1f2937" }}>{AI_INTERVIEW_UNAVAILABLE_ES}</p>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#1f2937" }}>
          Si necesitas ayuda, escríbenos a <a href={`mailto:${ATS_FROM_EMAIL}`}>{ATS_FROM_EMAIL}</a>.
        </p>
        <h2 style={{ fontSize: 22, margin: "28px 0 8px" }}>Not available</h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#1f2937" }}>{AI_INTERVIEW_UNAVAILABLE_EN}</p>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#1f2937" }}>
          If you need help, write to us at <a href={`mailto:${ATS_FROM_EMAIL}`}>{ATS_FROM_EMAIL}</a>.
        </p>
      </section>
    </main>
  );
}
