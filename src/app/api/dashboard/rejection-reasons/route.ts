/**
 * GET /api/dashboard/rejection-reasons?range=quarter|month|year
 *
 * Devuelve la distribución de motivos de rechazo del periodo solicitado:
 *   - total rechazos
 *   - breakdown por categoría con count + porcentaje
 *   - count de "save_for_future" para CV Bank reactivation
 *   - top 3 sub-detalles por categoría dominante
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const TS_CLIENT_ID = "98b62872-5767-4815-9b49-1394b9527c1f";

function rangeStart(range: string): Date {
  const now = new Date();
  if (range === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (range === "year") {
    return new Date(now.getFullYear(), 0, 1);
  }
  // default: quarter
  const q = Math.floor(now.getMonth() / 3);
  return new Date(now.getFullYear(), q * 3, 1);
}

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const range = req.nextUrl.searchParams.get("range") || "quarter";
  const since = rangeStart(range).toISOString();

  try {
    const [rejected, catalogRes] = await Promise.all([
      fetchAllRows(() =>
        supabaseAdmin
          .from("ht_candidates")
          .select("id, rejection_category, rejection_sub_detail, rejection_save_for_future, rejected_at")
          .eq("client_id", TS_CLIENT_ID)
          .eq("stage", "rechazado")
          .gte("rejected_at", since),
      ),
      supabaseAdmin
        .from("ts_rejection_categories")
        .select("category_key, category_label, sub_details")
        .eq("active", true),
    ]);
    const catalog = catalogRes.data;

    const total = (rejected || []).length;
    const savedForFuture = (rejected || []).filter((r: any) => r.rejection_save_for_future).length;
    const unclassified = (rejected || []).filter((r: any) => !r.rejection_category).length;

    const byCategory: Record<string, { count: number; sub_details: Record<string, number> }> = {};
    (rejected || []).forEach((r: any) => {
      const k = r.rejection_category || "sin_clasificar";
      if (!byCategory[k]) byCategory[k] = { count: 0, sub_details: {} };
      byCategory[k].count += 1;
      if (r.rejection_sub_detail) {
        byCategory[k].sub_details[r.rejection_sub_detail] =
          (byCategory[k].sub_details[r.rejection_sub_detail] || 0) + 1;
      }
    });

    const breakdown = Object.entries(byCategory)
      .map(([key, val]) => {
        const meta = (catalog || []).find((c: any) => c.category_key === key);
        const subDetailsRanked = Object.entries(val.sub_details)
          .map(([sdKey, sdCount]) => {
            const sdMeta = meta?.sub_details?.find((s: any) => s.key === sdKey);
            return { key: sdKey, label: sdMeta?.label || sdKey, count: sdCount };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
        return {
          category_key: key,
          category_label: meta?.category_label || (key === "sin_clasificar" ? "Sin clasificar" : key),
          count: val.count,
          percentage: total > 0 ? Math.round((val.count / total) * 100) : 0,
          top_sub_details: subDetailsRanked,
        };
      })
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      range,
      since,
      total,
      saved_for_future: savedForFuture,
      unclassified,
      breakdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[rejection-reasons]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
