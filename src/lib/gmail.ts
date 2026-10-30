/**
 * Gmail API helper — envía correos desde la cuenta Google Workspace de Kelly
 * (jointheteam@tradingsolutions.com).
 * Producción: una fila singleton en `google_oauth_tokens` (id=1).
 * preview y development: su propia fila en `google_oauth_tokens_env`.
 * Un preview sin fila no lee el token de producción.
 *
 * Flujo:
 *   1) Kelly autoriza una vez en /api/google/auth → /api/google/callback
 *   2) Recibimos refresh_token (NUNCA expira) y access_token (1h)
 *   3) Cada vez que enviamos email: si access_token expirado, lo refrescamos
 *   4) POST a Gmail API users.messages.send con el RFC 822 del correo encoded base64
 *
 * Sin paquete `googleapis` — usamos fetch directo. Más liviano, sin deps extra.
 */
import { neon } from "@/lib/sql";
import { ATS_FROM_EMAIL, atsFromHeader } from "@/lib/ats-from";
import { blockedSendLogLine, decideOutboundRecipients } from "@/lib/mail-recipient-guard";
import { buildAlternativeBody, encodeSubject, stripHeaderBreaks } from "@/lib/gmail-mime";
import { googleOAuthEnvironment, PREVIEW_GOOGLE_CONNECT_LABEL } from "@/lib/google-oauth-env";
import {
  deleteStoredTokens,
  readStoredTokens,
  writeStoredTokens,
  type GoogleTokens,
} from "@/lib/google-oauth-store";

export type { GoogleTokens };
export { PREVIEW_GOOGLE_CONNECT_LABEL };

export { ATS_FROM_NAME, ATS_FROM_NAME_EN, atsFromHeader, encodeMailboxDisplayName } from "@/lib/ats-from";

/**
 * Every draft and send uses the team mailbox. `fromName` and the connected
 * account's display name are ignored so Gmail cannot store Kelly or mojibake.
 */
function formatFrom(_name: string | undefined, _accountEmail: string): string {
  return atsFromHeader(ATS_FROM_EMAIL);
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
const GMAIL_LIST_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

function sqlClient() {
  return neon(process.env.DATABASE_URL!);
}

function currentEnvironment() {
  return googleOAuthEnvironment(process.env.VERCEL_ENV);
}

export async function getStoredTokens(): Promise<GoogleTokens | null> {
  return readStoredTokens(sqlClient(), currentEnvironment());
}

export async function saveTokens(tokens: {
  email: string;
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope?: string;
}) {
  await writeStoredTokens(sqlClient(), currentEnvironment(), tokens);
}

export async function clearTokens() {
  connectionProbe = null;
  await deleteStoredTokens(sqlClient(), currentEnvironment());
}

let connectionProbe: { at: number; environment: string; result: GmailConnection } | null = null;
const CONNECTION_PROBE_MS = 60_000;

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; scope?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no configurados en Vercel");
  }
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Google token refresh failed: ${r.status} ${txt}`);
  }
  const j = await r.json();
  return j as { access_token: string; expires_in: number; scope?: string };
}

export async function getValidAccessToken(): Promise<{ access_token: string; email: string } | null> {
  const stored = await getStoredTokens();
  if (!stored) return null;

  const now = Date.now();
  const expiresAt = new Date(stored.expires_at).getTime();
  // Si quedan menos de 60s, refrescar
  if (now > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(stored.refresh_token);
    await saveTokens({
      email: stored.email,
      access_token: refreshed.access_token,
      refresh_token: stored.refresh_token, // mantenemos el refresh_token
      expires_in: refreshed.expires_in,
      scope: refreshed.scope ?? stored.scope,
    });
    return { access_token: refreshed.access_token, email: stored.email };
  }
  return { access_token: stored.access_token, email: stored.email };
}

export type GmailConnection = {
  connected: boolean;
  email?: string;
  environment: ReturnType<typeof googleOAuthEnvironment>;
  connect_label?: string;
};

export async function isGmailConnected(): Promise<GmailConnection> {
  const environment = currentEnvironment();
  const disconnected: GmailConnection = {
    connected: false,
    environment,
    ...(environment === "preview" ? { connect_label: PREVIEW_GOOGLE_CONNECT_LABEL } : {}),
  };
  try {
    const stored = await getStoredTokens();
    if (!stored) {
      connectionProbe = null;
      return disconnected;
    }
    const now = Date.now();
    if (
      connectionProbe &&
      connectionProbe.environment === environment &&
      now - connectionProbe.at < CONNECTION_PROBE_MS
    ) {
      return connectionProbe.result;
    }
    // A stored row is not enough: a revoked refresh token still has a row.
    // getValidAccessToken refreshes when the access token is due, and throws
    // on invalid_grant. The result is cached so the banner does not refresh
    // on every poll.
    const valid = await getValidAccessToken();
    const result: GmailConnection = valid
      ? { connected: true, email: valid.email, environment }
      : disconnected;
    connectionProbe = { at: now, environment, result };
    return result;
  } catch {
    console.warn("[ats-mail] gmail token probe failed");
    connectionProbe = { at: Date.now(), environment, result: disconnected };
    return disconnected;
  }
}

// Codifica un correo en formato RFC 822 → base64url para Gmail API
function buildRfc822(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  cc?: string;
  bcc?: string;
}): string {
  const from = stripHeaderBreaks(opts.from);
  const to = stripHeaderBreaks(opts.to);
  const cc = opts.cc ? stripHeaderBreaks(opts.cc) : "";
  const replyTo = opts.replyTo ? stripHeaderBreaks(opts.replyTo) : "";
  const bcc = opts.bcc ? stripHeaderBreaks(opts.bcc) : "";
  const { boundary, body } = buildAlternativeBody(opts.html);
  const lines: string[] = [];
  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  if (cc) lines.push(`Cc: ${cc}`);
  if (replyTo) lines.push(`Reply-To: ${replyTo}`);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${encodeSubject(opts.subject)}`);
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push("");
  lines.push(body);
  return lines.join("\r\n");
}

/**
 * Crea un draft en Gmail (no envía). Útil para que HR revise y envíe manual.
 * Devuelve el draft_id; el usuario lo verá en su carpeta Drafts.
 */
export async function createDraftViaGmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  bcc?: string;
  fromName?: string;
}): Promise<{ ok: true; draft_id: string; gmail_email: string } | { ok: false; error: string }> {
  const valid = await getValidAccessToken();
  if (!valid) {
    return { ok: false, error: "Gmail no conectado. Pide a Kelly que vaya a Settings → Conectar Gmail." };
  }

  const rfc822 = buildRfc822({
    from: formatFrom(opts.fromName, valid.email),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo,
    bcc: opts.bcc,
  });
  const raw = Buffer.from(rfc822).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const r = await fetch(GMAIL_DRAFTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${valid.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!r.ok) {
    const txt = await r.text();
    return { ok: false, error: `Gmail draft create failed: ${r.status} ${txt}` };
  }
  const j = await r.json();
  return { ok: true, draft_id: j.id as string, gmail_email: valid.email };
}

export type GmailSendResult =
  | { ok: true; gmail_id: string }
  | { ok: false; error: string; blocked?: "bloqueado_staging"; blockedId?: string };

export async function sendViaGmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  cc?: string;
  bcc?: string;
  fromName?: string; // Display name (defaults to ATS_FROM_NAME when empty)
  /** Pending replay updates the claimed row instead of inserting another. */
  persistBlocked?: boolean;
  mailType?: string;
}): Promise<GmailSendResult> {
  const safe = {
    ...opts,
    to: stripHeaderBreaks(opts.to),
    cc: opts.cc ? stripHeaderBreaks(opts.cc) : undefined,
    bcc: opts.bcc ? stripHeaderBreaks(opts.bcc) : undefined,
    replyTo: opts.replyTo ? stripHeaderBreaks(opts.replyTo) : undefined,
    subject: stripHeaderBreaks(opts.subject),
  };
  const decision = decideOutboundRecipients(
    { to: safe.to, cc: safe.cc, bcc: safe.bcc },
    {
      MAIL_RECIPIENT_ALLOWLIST: process.env.MAIL_RECIPIENT_ALLOWLIST,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      K_SERVICE: process.env.K_SERVICE,
      STAGING_READ_ONLY: process.env.STAGING_READ_ONLY,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
  );
  if (!decision.send) {
    console.warn(blockedSendLogLine(decision));
    let blockedId: string | undefined;
    if (opts.persistBlocked !== false) {
      try {
        const { recordBlockedSend } = await import("@/lib/ats-mail-store");
        const saved = await recordBlockedSend({
          candidate: safe.to,
          type: opts.mailType ?? "gmail_send",
          subject: safe.subject,
          html: opts.html,
          reply_to: safe.replyTo ?? null,
          bcc: safe.bcc ?? null,
          reason: decision.reason,
        });
        blockedId = saved.id;
      } catch (e) {
        console.warn("[ats-mail] bloqueado_staging no se pudo guardar");
      }
    }
    return { ok: false, blocked: "bloqueado_staging", blockedId, error: "bloqueado_staging" };
  }

  const valid = await getValidAccessToken();
  if (!valid) {
    return { ok: false, error: "Gmail no conectado. Pide a Kelly que vaya a Settings → Conectar Gmail." };
  }

  const rfc822 = buildRfc822({
    from: formatFrom(safe.fromName, valid.email),
    to: safe.to,
    subject: safe.subject,
    html: safe.html,
    replyTo: safe.replyTo,
    cc: safe.cc,
    bcc: safe.bcc,
  });
  const raw = Buffer.from(rfc822).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const r = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${valid.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!r.ok) {
    const txt = await r.text();
    return { ok: false, error: `Gmail send failed: ${r.status} ${txt}` };
  }
  const j = await r.json();
  return { ok: true, gmail_id: j.id as string };
}

/**
 * Busca mensajes en Gmail según query (formato Gmail search).
 * Ejemplo: `from:cand@email.com OR to:cand@email.com newer_than:90d`
 * Devuelve array de message IDs (cada uno se puede pedir en detalle con getGmailMessageMetadata).
 */
export async function searchGmailMessages(
  query: string,
  maxResults = 10
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const valid = await getValidAccessToken();
  if (!valid) return { ok: false, error: "Gmail no conectado" };

  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  const r = await fetch(`${GMAIL_LIST_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${valid.access_token}` },
  });

  if (!r.ok) {
    const txt = await r.text();
    return { ok: false, error: `Gmail search failed: ${r.status} ${txt.slice(0, 200)}` };
  }

  const j = await r.json();
  const ids: string[] = (j.messages || []).map((m: any) => m.id);
  return { ok: true, ids };
}

/**
 * Pide metadata de un mensaje específico (From, To, Subject, Date, snippet).
 * Sin body para minimizar privacy footprint.
 */
export async function getGmailMessageMetadata(
  messageId: string
): Promise<{ ok: true; data: GmailMessageMeta } | { ok: false; error: string }> {
  const valid = await getValidAccessToken();
  if (!valid) return { ok: false, error: "Gmail no conectado" };

  const params = new URLSearchParams({
    format: "metadata",
    metadataHeaders: "From",
  });
  params.append("metadataHeaders", "To");
  params.append("metadataHeaders", "Subject");
  params.append("metadataHeaders", "Date");

  const r = await fetch(`${GMAIL_LIST_URL}/${messageId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${valid.access_token}` },
  });

  if (!r.ok) {
    const txt = await r.text();
    return { ok: false, error: `Gmail get failed: ${r.status} ${txt.slice(0, 200)}` };
  }

  const j = await r.json();
  const headers = (j.payload?.headers || []) as Array<{ name: string; value: string }>;
  const headerByName = (n: string) => headers.find(h => h.name.toLowerCase() === n.toLowerCase())?.value || "";

  return {
    ok: true,
    data: {
      id: j.id,
      thread_id: j.threadId,
      from: headerByName("From"),
      to: headerByName("To"),
      subject: headerByName("Subject"),
      date: headerByName("Date"),
      internal_date: j.internalDate ? Number(j.internalDate) : null,
      snippet: (j.snippet || "").slice(0, 200),
      label_ids: j.labelIds || [],
    },
  };
}

export type GmailMessageMeta = {
  id: string;
  thread_id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  internal_date: number | null;
  snippet: string;
  label_ids: string[];
};

/**
 * Convenience: dado un email del candidato, devuelve los últimos N intercambios
 * (enviados o recibidos). Cada item con metadata y snippet.
 */
export async function getCandidateGmailHistory(
  candidateEmail: string,
  maxResults = 5,
  daysBack = 180
): Promise<{ ok: true; messages: GmailMessageMeta[] } | { ok: false; error: string }> {
  const safe = candidateEmail.replace(/["']/g, "");
  const query = `(from:${safe} OR to:${safe}) newer_than:${daysBack}d`;
  const search = await searchGmailMessages(query, maxResults);
  if (!search.ok) return search;

  const messages: GmailMessageMeta[] = [];
  for (const id of search.ids) {
    const meta = await getGmailMessageMetadata(id);
    if (meta.ok) messages.push(meta.data);
  }
  // Ordenar por fecha (más reciente primero)
  messages.sort((a, b) => (b.internal_date || 0) - (a.internal_date || 0));
  return { ok: true, messages };
}

/**
 * ¿Sigue existiendo este borrador en Gmail?
 *
 * true  → está en Borradores, sin enviar.
 * false → ya no está: se envió o se borró a mano.
 * null  → no se pudo saber (Gmail desconectado, error de red). Quien llama
 *         decide; lo prudente es no crear otro encima.
 */
export async function gmailDraftExists(draftId: string): Promise<boolean | null> {
  const valid = await getValidAccessToken();
  if (!valid) return null;
  const r = await fetch(`${GMAIL_DRAFTS_URL}/${encodeURIComponent(draftId)}?format=minimal`, {
    headers: { Authorization: `Bearer ${valid.access_token}` },
  });
  if (r.status === 404) return false;
  if (!r.ok) return null;
  return true;
}

/**
 * Busca en Enviados el correo de rechazo de una persona.
 *
 * POR QUÉ EXISTE
 * Al rechazar, el ATS deja un borrador en Gmail y el equipo lo envía desde
 * Gmail. Ese envío el ATS no lo ve, así que la ficha se quedaba en «Sin
 * enviar» aunque el correo hubiera salido hace semanas. Esto lo verifica
 * contra la bandeja real.
 *
 * `desde` es la fecha del rechazo: solo cuenta lo que salió después. Sin ese
 * corte, alguien rechazado en agosto para otra vacante que volvió a aplicar
 * aparecería como «ya avisado» del rechazo nuevo.
 *
 * Reconoce el asunto actual («Sobre tu aplicación a …»), el viejo sin vacante
 * («Sobre tu aplicación») y el de los procesos en inglés.
 */
export async function findSentRejection(
  email: string,
  desde?: string | null,
): Promise<{ ok: true; sentAt: string | null; count: number } | { ok: false; error: string }> {
  const safe = email.replace(/["'\s]/g, "");
  if (!safe) return { ok: true, sentAt: null, count: 0 };

  let q = `in:sent to:${safe} (subject:"Sobre tu aplicación" OR subject:"About your application")`;
  if (desde) {
    // Un día de margen: Gmail corta `after:` por fecha, no por hora.
    const d = new Date(new Date(desde).getTime() - 86_400_000);
    q += ` after:${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }

  const search = await searchGmailMessages(q, 10);
  if (!search.ok) return search;
  if (search.ids.length === 0) return { ok: true, sentAt: null, count: 0 };

  // La fecha que vale es la del primer envío: si salió dos veces, el candidato
  // ya estaba avisado desde el primero.
  let primero: number | null = null;
  for (const id of search.ids) {
    const meta = await getGmailMessageMetadata(id);
    if (meta.ok && meta.data.internal_date && (primero === null || meta.data.internal_date < primero)) {
      primero = meta.data.internal_date;
    }
  }
  return {
    ok: true,
    sentAt: primero ? new Date(primero).toISOString() : new Date().toISOString(),
    count: search.ids.length,
  };
}

/**
 * Borrador con archivos adjuntos (multipart/mixed).
 *
 * `to` es opcional: el informe de vacante se deja sin destinatario para que
 * quien lo envía escriba el correo del líder a mano en Gmail.
 */
export async function createDraftWithAttachmentsViaGmail(opts: {
  to?: string | null;
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
  attachments: { filename: string; mimeType: string; data: Buffer }[];
}): Promise<{ ok: true; draft_id: string; message_id: string; gmail_email: string } | { ok: false; error: string }> {
  const valid = await getValidAccessToken();
  if (!valid) return { ok: false, error: "Gmail no está conectado o el permiso expiró." };

  const limite = "ts_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const enc = (t: string) => `=?UTF-8?B?${Buffer.from(t).toString("base64")}?=`;
  // base64 en líneas de 76: algunos clientes rechazan líneas más largas.
  const b64 = (b: Buffer) => b.toString("base64").replace(/.{1,76}/g, "$&\r\n").trimEnd();

  const l: string[] = [];
  l.push(`From: ${formatFrom(opts.fromName, valid.email)}`);
  if (opts.to) l.push(`To: ${opts.to}`);
  if (opts.replyTo) l.push(`Reply-To: ${opts.replyTo}`);
  l.push(`Subject: ${enc(opts.subject)}`);
  l.push("MIME-Version: 1.0");
  l.push(`Content-Type: multipart/mixed; boundary="${limite}"`);
  l.push("");
  l.push(`--${limite}`);
  l.push('Content-Type: text/html; charset="UTF-8"');
  l.push("Content-Transfer-Encoding: base64");
  l.push("");
  l.push(b64(Buffer.from(opts.html)));
  for (const a of opts.attachments) {
    l.push(`--${limite}`);
    l.push(`Content-Type: ${a.mimeType}; name="${enc(a.filename)}"`);
    l.push(`Content-Disposition: attachment; filename="${enc(a.filename)}"`);
    l.push("Content-Transfer-Encoding: base64");
    l.push("");
    l.push(b64(a.data));
  }
  l.push(`--${limite}--`);

  const raw = Buffer.from(l.join("\r\n")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const r = await fetch(GMAIL_DRAFTS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${valid.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!r.ok) return { ok: false, error: `Gmail no creó el borrador: ${r.status} ${(await r.text()).slice(0, 300)}` };
  const j = await r.json();
  return { ok: true, draft_id: j.id, message_id: j.message?.id, gmail_email: valid.email };
}
