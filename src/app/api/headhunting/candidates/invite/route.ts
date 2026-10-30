import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Resend } from 'resend';
import { createDraftViaGmail, isGmailConnected } from '@/lib/gmail';
import crypto from 'crypto';
import { ATS_FROM_NAME, candidateSignatureHtml } from "@/lib/ats-from";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/**
 * Modes:
 *   - 'auto' (default): Si Gmail conectado → crea draft. Si no, intenta Resend.
 *                       Si nada disponible, devuelve solo el token.
 *   - 'draft': Fuerza creación de draft en Gmail (requiere conexión).
 *   - 'send':  Fuerza envío via Resend (legacy).
 *   - 'token-only': No envía nada, solo genera el token.
 */
type InviteMode = 'auto' | 'draft' | 'send' | 'token-only';

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const { candidate_id, mode: rawMode } = await req.json() as { candidate_id?: string; mode?: InviteMode };
    const mode: InviteMode = rawMode ?? 'auto';

    if (!candidate_id) {
      return NextResponse.json({ error: 'candidate_id requerido' }, { status: 400 });
    }

    // Get candidate
    const { data: candidate, error } = await supabaseAdmin
      .from('ht_candidates')
      .select('*, ht_vacancies(*), ht_clients(*)')
      .eq('id', candidate_id)
      .single();

    if (error || !candidate) {
      return NextResponse.json({ error: 'Candidato no encontrado' }, { status: 404 });
    }

    if (candidate.status !== 'pending') {
      return NextResponse.json(
        { error: `Candidato ya tiene estado: ${candidate.status}` },
        { status: 400 }
      );
    }

    // Generate unique token
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72); // 72-hour expiry

    // Update candidate with token
    await supabaseAdmin
      .from('ht_candidates')
      .update({
        assessment_token: token,
        token_expires_at: expiresAt.toISOString(),
        status: 'invited',
        invited_at: new Date().toISOString(),
      })
      .eq('id', candidate_id);

    // Build assessment URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.elevarecareer.com';
    const assessmentUrl = `${baseUrl}/assessment/ht/${token}`;

    // Get client info for branding
    const clientName = candidate.ht_clients?.name || 'Trading Solutions';
    const vacancyTitle = candidate.ht_vacancies?.title || 'la vacante';
    const senderEmail = candidate.ht_clients?.sender_email || 'jointheteam@tradingsolutions.com';

    // ── Construir el HTML del correo (compartido por draft y send) ───────
    const emailSubject = `Trading Solutions · Evaluación para ${vacancyTitle}`;
    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Inter, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background: #f5f5f5; }
  .container { max-width: 600px; margin: 0 auto; background: white; }
  .header { background: #2C64ED; padding: 32px; text-align: center; }
  .header h1 { color: white; font-size: 24px; margin: 0; font-weight: 600; }
  .body { padding: 32px; }
  .cta { display: inline-block; background: #2C64ED; color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0; }
  .footer { padding: 24px 32px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #eee; }
  .info-box { background: #EBF0FF; border-radius: 8px; padding: 16px; margin: 16px 0; }
</style></head><body>
  <div class="container">
    <div class="header"><h1>${clientName}</h1></div>
    <div class="body">
      <p>Hola <strong>${candidate.name}</strong>,</p>
      <p>Esperamos que estés muy bien. Te escribimos para invitarte a la siguiente etapa de nuestro proceso de selección para la posición de <strong>${vacancyTitle}</strong> en ${clientName}.</p>
      <p>El siguiente paso es una evaluación que nos ayuda a entender mejor cómo piensas y decides en situaciones reales del trabajo. No hay respuestas correctas o incorrectas — solo queremos conocer tu forma de ser.</p>
      <p style="text-align:center"><a href="${assessmentUrl}" class="cta">Iniciar Evaluación</a></p>
      <div class="info-box"><p style="margin:0"><strong>Detalles importantes:</strong></p>
        <ul style="margin:8px 0">
          <li>Duración aproximada: <strong>55 minutos</strong></li>
          <li>Necesitas: computador con internet estable y cámara web (la usamos para verificar identidad)</li>
          <li>Recomendación: busca un espacio tranquilo, sin interrupciones</li>
          <li>El enlace es válido por <strong>72 horas</strong></li>
          <li>Tus respuestas se guardan automáticamente</li>
          <li>Responde con tu primera reacción</li>
        </ul></div>
      <p>Si tienes alguna pregunta, simplemente responde este correo.</p>
      ${candidateSignatureHtml("es")}
    </div>
    <div class="footer">Powered by ELEVARE Career · Evaluación confidencial<br>Este enlace es personal e intransferible.</div>
  </div></body></html>`;

    // ── Dispatcher por modo ──────────────────────────────────────────────
    const okBase = {
      success: true as const,
      candidate_id,
      assessment_url: assessmentUrl,
      expires_at: expiresAt.toISOString(),
    };

    if (mode === 'token-only') {
      return NextResponse.json({ ...okBase, channel: 'token-only' });
    }

    // 'auto' o 'draft': intentar Gmail primero
    if (mode === 'auto' || mode === 'draft') {
      const gmailStatus = await isGmailConnected();
      if (gmailStatus.connected) {
        const draftRes = await createDraftViaGmail({
          to: candidate.email,
          subject: emailSubject,
          html: emailHtml,
          fromName: ATS_FROM_NAME,
        });
        if (draftRes.ok) {
          return NextResponse.json({
            ...okBase,
            channel: 'gmail-draft',
            draft_id: draftRes.draft_id,
            gmail_email: draftRes.gmail_email,
            note: 'Draft creado en Gmail. Revisa tu carpeta Drafts y dale Send.',
          });
        }
        if (mode === 'draft') {
          return NextResponse.json({ ...okBase, channel: 'gmail-draft-failed', error: draftRes.error }, { status: 207 });
        }
        // mode='auto' y Gmail falló: caer a Resend
      } else if (mode === 'draft') {
        return NextResponse.json({ ...okBase, channel: 'gmail-not-connected', error: 'Gmail no conectado. Ve a Settings → Conectar Gmail.' }, { status: 207 });
      }
    }

    // 'send' o fallback de 'auto': intentar Resend
    const resend = getResend();
    if (!resend) {
      return NextResponse.json({
        ...okBase,
        channel: 'token-only',
        email_sent: false,
        note: 'Sin Gmail conectado y sin RESEND_API_KEY — token generado, copialo manualmente. Conecta Gmail en Settings para auto-drafts.',
      });
    }
    const { error: emailError } = await resend.emails.send({
      from: `${ATS_FROM_NAME} <${senderEmail}>`,
      to: candidate.email,
      subject: emailSubject,
      html: emailHtml,
    });

    if (emailError) {
      console.error('Email send error:', emailError);
      return NextResponse.json({ ...okBase, channel: 'resend-failed', error: emailError.message }, { status: 207 });
    }

    return NextResponse.json({ ...okBase, channel: 'resend-sent' });
  } catch (err) {
    console.error('Invite error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
