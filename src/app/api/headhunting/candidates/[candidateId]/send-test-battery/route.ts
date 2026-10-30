/**
 * POST /api/headhunting/candidates/[candidateId]/send-test-battery
 *
 * Crea un draft en el Gmail de Kelly con la plantilla de batería de pruebas
 * complementarias (16Personalities + DISC + Motivación + 2 placeholders para
 * Bluesite y Psicoalianza). Kelly/Mary completa los 2 placeholders manualmente
 * antes de enviar.
 *
 * Tres pruebas son self-reported: el candidato completa el test público y
 * reenvía los resultados al correo de Kelly.
 *
 * Bluesite (BETESA) y Psicoalianza requieren setup manual por candidato (no
 * tienen API pública), por eso van como placeholder.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import { ATS_FROM_NAME, candidateSignatureHtml } from "@/lib/ats-from";

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = params;
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId requerido" }, { status: 400 });
    }

    const { data: candidate, error } = await supabaseAdmin
      .from("ht_candidates")
      .select("*, ht_vacancies(title, form_template_key, country), ht_clients(name)")
      .eq("id", candidateId)
      .single();

    if (error || !candidate) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    const gmailStatus = await isGmailConnected();
    if (!gmailStatus.connected) {
      return NextResponse.json(
        { error: "Gmail no conectado. Settings → Conectar Gmail." },
        { status: 503 }
      );
    }

    // El proceso de China corre en ingles · el candidato no habla espanol.
    const rawVacancyTitle = (candidate as any).ht_vacancies?.title as string | undefined;
    const lang = resolveCandidateLang({
      formTemplateKey: (candidate as any).ht_vacancies?.form_template_key,
      preferredLanguage: (candidate as any).preferred_language,
      jobTitle: rawVacancyTitle,
      country: (candidate as any).ht_vacancies?.country,
    });

    // Primer nombre para personalizar el saludo
    const firstName =
      (candidate.name || "").split(" ")[0] || (lang === "en" ? "there" : "candidato");
    const vacancyTitle = rawVacancyTitle || (lang === "en" ? "the position" : "la vacante");

    const subject =
      lang === "en"
        ? `Trading Solutions · Complementary assessments for ${candidate.name}`
        : `Trading Solutions · Pruebas complementarias para ${candidate.name}`;

    // HTML body con la plantilla de Mary, ajustada para mantener orden y
    // dejar placeholders muy visibles para Bluesite y Psicoalianza.
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; margin: 0; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  ol { padding-left: 20px; }
  ol li { margin-bottom: 14px; }
  a { color: #0a0a0a; text-decoration: underline; }
  .nota { color: #737373; font-size: 13px; }
  .placeholder { background: #fff8e1; padding: 6px 10px; color: #8a6d1c; font-weight: 600; font-size: 13px; }
  .footer { margin-top: 24px; color: #a3a3a3; font-size: 11px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
  p { margin: 0 0 14px; font-size: 14px; }
</style></head><body>
  <div class="container">
    <p>Hola <strong>${firstName}</strong>,</p>

    <p>Llegaste a la siguiente etapa para la posición de <strong>${vacancyTitle}</strong>. Antes de la entrevista final queremos conocer un poco más cómo pensás y trabajás · estos cuestionarios nos ayudan a tener esa lectura.</p>

    <ol>
      <li>
        <strong>16 Personalities (MBTI):</strong> <a href="https://www.16personalities.com/es/test-de-personalidad">16personalities.com</a><br>
        <span class="nota">Al terminar, compartime los dos links que aparecen al darle al ícono de compartir.</span>
      </li>
      <li>
        <strong>DISC:</strong> <a href="https://miperfildisc.com/">miperfildisc.com</a><br>
        <span class="nota">Vas a recibir el resultado por correo · reenvialo a esta misma dirección.</span>
      </li>
      <li>
        <strong>Test de motivación:</strong> <a href="https://motivation-test-production.up.railway.app/">motivation-test-production.up.railway.app</a>
      </li>
      <li>
        <strong>BETESA (Bluesite):</strong>
        <span class="placeholder">[ PEGAR ENLACE PERSONALIZADO ]</span>
      </li>
      <li>
        <strong>Psicoalianza:</strong>
        <span class="placeholder">[ PEGAR ENLACE PERSONALIZADO ]</span>
      </li>
    </ol>

    <p>Tomate tu tiempo · son alrededor de 2 horas en total y podés repartirlas en varias sesiones. No hay respuestas correctas, solo tu forma de ver las cosas.</p>

    <p>Cuando termines, contame por este mismo correo. Si surge cualquier duda en el camino, escribime.</p>

    ${candidateSignatureHtml("es")}

    <div class="footer">Antes de enviar, pegá los enlaces personalizados de Bluesite y Psicoalianza.</div>
  </div>
</body></html>`;

    // Gemelo en ingles · mismos cinco cuestionarios, mismos placeholders para
    // Bluesite y Psicoalianza, firma del equipo en vez de una persona.
    const htmlEn = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Open Sauce Sans', -apple-system, sans-serif; line-height: 1.6; color: #0a0a0a; margin: 0; padding: 24px; background: #fafafa; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 32px; border: 1px solid #e8e8e8; }
  ol { padding-left: 20px; }
  ol li { margin-bottom: 14px; }
  a { color: #0a0a0a; text-decoration: underline; }
  .nota { color: #737373; font-size: 13px; }
  .placeholder { background: #fff8e1; padding: 6px 10px; color: #8a6d1c; font-weight: 600; font-size: 13px; }
  .footer { margin-top: 24px; color: #a3a3a3; font-size: 11px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
  p { margin: 0 0 14px; font-size: 14px; }
</style></head><body>
  <div class="container">
    <p>Hi <strong>${firstName}</strong>,</p>

    <p>You have reached the next stage for the <strong>${vacancyTitle}</strong> position. Before the final interview we would like to understand a little more about how you think and work · these questionnaires give us that picture.</p>

    <ol>
      <li>
        <strong>16 Personalities (MBTI):</strong> <a href="https://www.16personalities.com/free-personality-test">16personalities.com</a><br>
        <span class="nota">When you finish, send us the two links that appear under the share icon.</span>
      </li>
      <li>
        <strong>DISC:</strong> <a href="https://miperfildisc.com/">miperfildisc.com</a><br>
        <span class="nota">You will receive the result by email · please forward it to this same address.</span>
      </li>
      <li>
        <strong>Motivation test:</strong> <a href="https://motivation-test-production.up.railway.app/">motivation-test-production.up.railway.app</a>
      </li>
      <li>
        <strong>BETESA (Bluesite):</strong>
        <span class="placeholder">[ PASTE PERSONAL LINK ]</span>
      </li>
      <li>
        <strong>Psicoalianza:</strong>
        <span class="placeholder">[ PASTE PERSONAL LINK ]</span>
      </li>
    </ol>

    <p>Take your time · they add up to around 2 hours in total and you can split them across several sessions. There are no right answers, only your own way of seeing things.</p>

    <p>Let us know through this same email when you are done. If anything comes up along the way, just write to us.</p>

    ${candidateSignatureHtml("en")}

    <div class="footer">Before sending, paste the personal Bluesite and Psicoalianza links.</div>
  </div>
</body></html>`;

    const draftRes = await createDraftViaGmail({
      to: candidate.email,
      subject,
      html: lang === "en" ? htmlEn : html,
      fromName: ATS_FROM_NAME,
    });

    if (!draftRes.ok) {
      return NextResponse.json(
        { error: "Error creando draft", detail: draftRes.error },
        { status: 502 }
      );
    }

    // Marcar en DB que se envió la batería (idempotente — si ya existe el
    // campo, lo sobreescribe; si la columna no existe, el catch silencia)
    try {
      await supabaseAdmin
        .from("ht_candidates")
        .update({ tests_battery_sent_at: new Date().toISOString() })
        .eq("id", candidateId);
    } catch {
      // columna probablemente no existe aún — lo trackeamos en draft_id solo
    }

    return NextResponse.json({
      success: true,
      candidate_id: candidateId,
      candidate_name: candidate.name,
      candidate_email: candidate.email,
      vacancy: vacancyTitle,
      idioma: lang,
      draft_id: draftRes.draft_id,
      gmail_email: draftRes.gmail_email,
      note: "Draft creado en Gmail. Antes de enviar, completa los enlaces personalizados de Bluesite y Psicoalianza.",
      placeholders: ["Bluesite", "Psicoalianza"],
    });
  } catch (err) {
    console.error("send-test-battery error:", err);
    return NextResponse.json(
      { error: "Error interno", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
