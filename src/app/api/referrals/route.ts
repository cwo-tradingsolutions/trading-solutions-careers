/**
 * POST /api/referrals  → público (sin auth) — recibe CV recomendado
 * GET  /api/referrals  → admin — lista todos los referrals para review
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isPreviewTestMode, previewTestJson } from "@/lib/preview-mode";

// Node.js runtime para aceptar bodies grandes (CV base64 puede ser hasta ~7MB)
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validación mínima
    if (!body.candidate_name || !String(body.candidate_name).trim()) {
      return NextResponse.json({ error: "El nombre del candidato es obligatorio" }, { status: 400 });
    }
    if (!body.referrer_name || !String(body.referrer_name).trim()) {
      return NextResponse.json({ error: "Tu nombre es obligatorio" }, { status: 400 });
    }

    if (isPreviewTestMode()) {
      return previewTestJson("POST /api/referrals");
    }

    // Anti-spam mínimo: rate limit por IP (1 referral por minuto)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    if (ip !== 'unknown') {
      const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from('ts_referrals')
        .select('id')
        .eq('ip_address', ip)
        .gte('created_at', oneMinAgo)
        .limit(1);
      if (recent && recent.length > 0) {
        return NextResponse.json({ error: "Esperá un minuto antes de enviar otro" }, { status: 429 });
      }
    }

    // CV viene como data URI base64 desde el form (data:application/pdf;base64,...)
    // No truncar · el límite real es 5MB validado en el frontend + Supabase TEXT column.
    // Validación adicional server-side: rechazar si el CV pesa más de 7MB (margen sobre 5MB en base64)
    const cvRaw = body.cv_url ? String(body.cv_url) : null;
    if (cvRaw && cvRaw.length > 7 * 1024 * 1024) {
      return NextResponse.json({ error: "El CV es demasiado grande (máx 5MB)" }, { status: 413 });
    }

    const payload = {
      candidate_name: String(body.candidate_name).trim().slice(0, 200),
      candidate_email: body.candidate_email ? String(body.candidate_email).trim().toLowerCase().slice(0, 200) : null,
      candidate_phone: body.candidate_phone ? String(body.candidate_phone).trim().slice(0, 50) : null,
      candidate_role: body.candidate_role ? String(body.candidate_role).trim().slice(0, 200) : null,
      candidate_location: body.candidate_location ? String(body.candidate_location).trim().slice(0, 200) : null,
      // cv_url guarda el archivo completo como data URI (base64) · NO truncar
      cv_url: cvRaw,
      cv_filename: body.cv_filename ? String(body.cv_filename).trim().slice(0, 200) : null,
      linkedin_url: body.linkedin_url ? String(body.linkedin_url).trim().slice(0, 500) : null,
      referrer_name: String(body.referrer_name).trim().slice(0, 200),
      referrer_email: body.referrer_email ? String(body.referrer_email).trim().toLowerCase().slice(0, 200) : null,
      referrer_relationship: body.referrer_relationship ? String(body.referrer_relationship).trim().slice(0, 100) : null,
      notes: body.notes ? String(body.notes).slice(0, 5000) : null,
      recommended_for_role: body.recommended_for_role ? String(body.recommended_for_role).trim().slice(0, 200) : null,
      source_channel: body.source_channel || 'public_form',
      ip_address: ip,
      user_agent: req.headers.get('user-agent')?.slice(0, 500) || null,
      status: 'received',
    };

    const { data, error } = await supabaseAdmin
      .from('ts_referrals')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      console.error('referrals insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, referral_id: data.id });
  } catch (err: any) {
    console.error('referrals POST error:', err);
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');

  let q = supabaseAdmin
    .from('ts_referrals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ referrals: data || [], total: data?.length || 0 });
}
