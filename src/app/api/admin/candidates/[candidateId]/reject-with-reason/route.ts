/**
 * POST /api/admin/candidates/[candidateId]/reject-with-reason
 *
 * Rechaza un candidato con clasificación obligatoria.
 *
 * Body:
 *   - category_key:           string · obligatorio (de ts_rejection_categories)
 *   - sub_detail_key:         string · obligatorio (debe existir en sub_details de la categoría)
 *   - note_private:           string · opcional · interno · solo equipo TS
 *   - note_public:            string · opcional · va al candidato si create_draft=true
 *   - save_for_future:        boolean · marca el perfil para CV Bank rediscovery
 *   - create_rejection_draft: boolean · default true · crea draft de Gmail con note_public
 *
 * Side effects:
 *   - stage = 'rechazado', status = 'rejected'
 *   - rejected_by + rejected_at
 *   - open_to_rediscovery se sincroniza vía trigger SQL
 *   - opcionalmente: draft de Gmail con copy editado
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { recordStageEvent } from "@/lib/stage-events";
import {
  buildRejectionHtml,
  rejectionSubject,
  REJECTION_FROM_NAME,
  REJECTION_FROM_NAME_EN,
  EN_REJECTION_BODY,
  REJECTION_REPLY_TO,
} from "@/lib/rejection-email";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import { isPreviewMutationBlocked } from "@/lib/preview-readonly";


export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidateId } = params;
    const body = await req.json();

    const categoryKey: string = String(body.category_key || "").trim();
    const subDetailKey: string = String(body.sub_detail_key || "").trim();
    const notePrivate: string | null = body.note_private?.trim() || null;
    const notePublic: string | null = body.note_public?.trim() || null;
    const saveForFuture: boolean = body.save_for_future !== false; // default true
    const createDraft: boolean = body.create_rejection_draft !== false;
    const rejectedBy: string = String(body.rejected_by || "kelly").trim();

    if (!categoryKey) {
      return NextResponse.json({ error: "category_key requerido" }, { status: 400 });
    }
    if (!subDetailKey) {
      return NextResponse.json({ error: "sub_detail_key requerido" }, { status: 400 });
    }

    // Validar que category + sub_detail existan en el catálogo
    const { data: category } = await supabaseAdmin
      .from("ts_rejection_categories")
      .select("category_key, category_label, sub_details, public_message_template")
      .eq("category_key", categoryKey)
      .eq("active", true)
      .maybeSingle();

    if (!category) {
      return NextResponse.json({ error: "Categoría no encontrada o inactiva" }, { status: 404 });
    }

    const subDetailValid = (category.sub_details as any[]).some(
      (sd: any) => sd.key === subDetailKey
    );
    if (!subDetailValid) {
      return NextResponse.json({
        error: "sub_detail_key no pertenece a esta categoría",
        available: (category.sub_details as any[]).map((sd: any) => sd.key),
      }, { status: 400 });
    }

    // Cargar candidato
    const { data: candidate, error: fetchErr } = await supabaseAdmin
      .from("ht_candidates")
      .select("id, name, email, vacancy_id, stage, preferred_language, ht_vacancies(title, form_template_key, country)")
      .eq("id", candidateId)
      .maybeSingle();

    if (fetchErr || !candidate) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    // El idioma del proceso decide hasta los textos por defecto.
    const candLang = resolveCandidateLang({
      formTemplateKey: (candidate as any).ht_vacancies?.form_template_key,
      preferredLanguage: (candidate as any).preferred_language,
      jobTitle: (candidate as any).ht_vacancies?.title,
      country: (candidate as any).ht_vacancies?.country,
    });
    const vacancyTitle: string =
      ((candidate as any).ht_vacancies?.title as string) ||
      (candLang === "en" ? "the position" : "la posición");
    const firstName = (candidate.name || "").split(" ")[0] || (candLang === "en" ? "there" : "candidato");

    // Update candidato
    const updates: Record<string, unknown> = {
      stage: "rechazado",
      status: "rejected",
      rejection_category: categoryKey,
      rejection_sub_detail: subDetailKey,
      rejection_note_private: notePrivate,
      rejection_note_public: notePublic,
      rejection_save_for_future: saveForFuture,
      rejected_by: rejectedBy,
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let draftId: string | null = null;

    if (createDraft && candidate.email) {
      try {
        const gmail = await isGmailConnected();
        if (gmail.connected) {
          // El note_public manda; si no hay, usamos el template de la categoría
          // En inglés, la plantilla de la categoría está en español: solo sirve
          // el texto que el reclutador escribió para esta persona. Si no hay,
          // se usa el cuerpo genérico en inglés en vez de mandarle español.
          const messageBody = candLang === "en"
            ? (notePublic || EN_REJECTION_BODY)
            : (notePublic || category.public_message_template || "");
          if (messageBody) {
            const html = buildRejectionHtml(firstName, vacancyTitle, messageBody, candLang);
            const draftRes = await createDraftViaGmail({
              to: candidate.email as string,
              subject: rejectionSubject(vacancyTitle, candLang),
              html,
              fromName: candLang === "en" ? REJECTION_FROM_NAME_EN : REJECTION_FROM_NAME,
              replyTo: REJECTION_REPLY_TO,
            });
            if (draftRes.ok) {
              draftId = draftRes.draft_id;
              updates.rejection_draft_id = draftRes.draft_id;
            }
          }
        }
      } catch (e) {
        console.error("Failed to create rejection draft:", e);
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from("ht_candidates")
      .update(updates)
      .eq("id", candidateId);

    if (updateErr) {
      return NextResponse.json({ error: "save_failed", detail: updateErr.message }, { status: 500 });
    }

    // El descarte también es un movimiento de etapa: sin el evento el candidato
    // conserva el historial de su etapa anterior y el dashboard le sigue
    // contando días donde ya no está.
    await recordStageEvent({
      candidateId,
      fromStage: (candidate.stage as string) ?? null,
      toStage: "rechazado",
      vacancyId: (candidate.vacancy_id as string) ?? null,
      source: "system",
      changedBy: rejectedBy || null,
      note: `${categoryKey} · ${subDetailKey}`,
    });

    return NextResponse.json({
      success: true,
      candidate_id: candidateId,
      from_stage: candidate.stage,
      to_stage: "rechazado",
      category_key: categoryKey,
      sub_detail_key: subDetailKey,
      save_for_future: saveForFuture,
      draft_id: draftId,
    });
  } catch (err: any) {
    console.error("reject-with-reason error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
