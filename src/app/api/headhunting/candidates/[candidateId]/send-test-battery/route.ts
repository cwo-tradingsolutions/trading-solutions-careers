/**
 * POST /api/headhunting/candidates/[candidateId]/send-test-battery
 *
 * Botón «Pruebas complementarias». Crea un BORRADOR en Gmail (nunca envía)
 * con todas las pruebas externas activas del catálogo `ts_test_providers` que
 * apliquen (armado en src/lib/pruebas-complementarias.ts). DISC Prime es el
 * único DISC; myDISCprofile y miperfildisc.com ya no se ofrecen (sus datos no
 * se tocan).
 *
 * Las pruebas cuyo enlace es personal (DISC Prime, Bluesite, Psicoalianza,
 * Turing…) van como placeholder: Talent pega el enlace antes de enviar.
 *
 * Cada borrador queda registrado en `ht_pruebas_complementarias_envios`. Si el
 * registro falla, se loguea y se devuelve en la respuesta (`registro.ok=false`)
 * para que la pantalla lo muestre: ya no se traga el error.
 *
 * Modo dry-run (`{"dry_run": true}` o `?dry_run=1`): arma el correo y lo
 * devuelve sin tocar Gmail; registra con modo `dry_run`. En staging
 * (STAGING_READ_ONLY=1 / VERCEL_ENV=preview) el dry-run es obligatorio: ahí
 * nunca se llama a Gmail.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createDraftViaGmail, isGmailConnected } from "@/lib/gmail";
import { resolveCandidateLang } from "@/lib/candidate-lang";
import { ATS_FROM_NAME } from "@/lib/ats-from";
import { isPreviewTestMode } from "@/lib/preview-mode";
import { readAdminSession } from "@/lib/hr-admin-session";
import { readSessionSecret } from "@/lib/hr-admin-secrets";
import { listarProveedores } from "@/lib/pruebas-externas";
import { armarBorrador, registrarBorrador, type ModoRegistro } from "@/lib/pruebas-complementarias";

export const dynamic = "force-dynamic";

function quienLoPide(req: NextRequest): string | null {
  const secret = readSessionSecret();
  const tok = req.cookies.get("hr_admin_session")?.value;
  if (secret && tok) return readAdminSession(tok, secret)?.email ?? null;
  return req.headers.get("authorization") ? "api-bearer" : null;
}

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

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const pidioDryRun = body?.dry_run === true || req.nextUrl.searchParams.get("dry_run") === "1";
    const forzadoPorStaging = isPreviewTestMode();
    const dryRun = pidioDryRun || forzadoPorStaging;

    const { data: candidate, error } = await supabaseAdmin
      .from("ht_candidates")
      .select("*, ht_vacancies(title, form_template_key, country), ht_clients(name)")
      .eq("id", candidateId)
      .single();

    if (error || !candidate) {
      return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
    }

    // Catálogo: si no se puede leer, no se arma un correo a ciegas.
    let catalogo;
    try {
      catalogo = await listarProveedores();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[pruebas-complementarias] no se pudo leer ts_test_providers: ${msg}`);
      return NextResponse.json(
        { error: "No se pudo leer el catálogo de pruebas (ts_test_providers)", detail: msg },
        { status: 500 },
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

    const firstName =
      (candidate.name || "").split(" ")[0] || (lang === "en" ? "there" : "candidato");
    const vacancyTitle = rawVacancyTitle || (lang === "en" ? "the position" : "la vacante");

    const borrador = armarBorrador({
      catalogo,
      lang,
      candidateName: candidate.name || "",
      firstName,
      vacancyTitle,
    });
    if (borrador.pruebas.length === 0) {
      return NextResponse.json(
        { error: "El catálogo no tiene pruebas activas para el borrador" },
        { status: 409 },
      );
    }

    let draftId: string | null = null;
    let gmailEmail: string | null = null;

    if (!dryRun) {
      const gmailStatus = await isGmailConnected();
      if (!gmailStatus.connected) {
        return NextResponse.json(
          { error: "Gmail no conectado. Settings → Conectar Gmail." },
          { status: 503 }
        );
      }
      // Solo borrador: createDraftViaGmail usa users.drafts.create, no send.
      const draftRes = await createDraftViaGmail({
        to: candidate.email,
        subject: borrador.subject,
        html: borrador.html,
        fromName: ATS_FROM_NAME,
      });
      if (!draftRes.ok) {
        console.error(`[pruebas-complementarias] Gmail draft falló (${candidateId}): ${draftRes.error}`);
        return NextResponse.json(
          { error: "Error creando draft", detail: draftRes.error },
          { status: 502 }
        );
      }
      draftId = draftRes.draft_id ?? null;
      gmailEmail = draftRes.gmail_email ?? null;
    }

    const modo: ModoRegistro = dryRun ? "dry_run" : "borrador_gmail";
    const registro = await registrarBorrador(supabaseAdmin as any, {
      candidate_id: candidateId,
      vacancy_id: (candidate as any).vacancy_id ?? null,
      modo,
      idioma: lang,
      pruebas: borrador.pruebas.map((p) => p.key),
      placeholders: borrador.placeholders,
      draft_id: draftId,
      gmail_email: gmailEmail,
      creado_por: quienLoPide(req),
    });

    const placeholdersTxt = borrador.placeholders.join(", ");
    const note = dryRun
      ? `Vista previa (dry-run): no se creó borrador en Gmail ni se envió nada${forzadoPorStaging ? " (staging)" : ""}.`
      : `Borrador creado en Gmail (no se envió). Antes de enviarlo, pega los enlaces personales de: ${placeholdersTxt}.`;

    // El borrador de Gmail ya existe: devolver 200 para no invitar a repetirlo,
    // pero con el fallo del registro a la vista. En dry-run no hay nada creado,
    // así que un registro fallido es un error de la petición.
    const status = !registro.ok && dryRun ? 500 : 200;

    return NextResponse.json(
      {
        success: registro.ok || !dryRun,
        dry_run: dryRun,
        candidate_id: candidateId,
        candidate_name: candidate.name,
        candidate_email: candidate.email,
        vacancy: vacancyTitle,
        idioma: lang,
        draft_id: draftId,
        gmail_email: gmailEmail,
        pruebas: borrador.pruebas,
        placeholders: borrador.placeholders,
        registro,
        ...(registro.ok
          ? {}
          : { error: "El envío NO quedó registrado en el ATS", detail: registro.error }),
        note,
        ...(dryRun ? { subject: borrador.subject, html: borrador.html, texto: borrador.texto } : {}),
      },
      { status },
    );
  } catch (err) {
    console.error("send-test-battery error:", err);
    return NextResponse.json(
      { error: "Error interno", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
