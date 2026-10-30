import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ATS_FROM_EMAIL, ATS_FROM_NAME, atsFromHeader } from "./ats-from.ts";
import {
  candidateMailStatus,
  dailySendWarning,
  deliverCandidateMail,
  mailboxDisconnectedBanner,
  resendPendingOnce,
  type ClaimedMail,
} from "./ats-mail.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

test("no code path imports Resend", () => {
  assert.equal(existsSync(join(root, "src/lib/resend.ts")), false);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  assert.equal(pkg.dependencies?.resend, undefined);
  for (const path of walk(join(root, "src"))) {
    const src = readFileSync(path, "utf8");
    assert.doesNotMatch(src, /from\s+['"]resend['"]/, path);
    assert.doesNotMatch(src, /@\/lib\/resend/, path);
    assert.doesNotMatch(src, /require\(\s*['"]resend['"]\s*\)/, path);
  }
});

test("a disconnected mailbox saves a pending row and does not fall back", async () => {
  const saved: Array<Record<string, unknown>> = [];
  const result = await deliverCandidateMail(
    {
      to: "ana@example.com",
      candidate: "ana@example.com",
      type: "application_received",
      subject: "Recibimos tu aplicación",
      html: "<p>hola</p>",
      replyTo: "jointheteam@tradingsolutions.com",
    },
    {
      send: async () => ({ ok: false, error: "Gmail no conectado" }),
      savePending: async (row) => {
        saved.push(row);
        return { id: "pending-1" };
      },
      recordSend: async () => {
        throw new Error("a failed send must not count");
      },
    },
  );
  assert.deepEqual(result, { status: "pending", id: "pending-1" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].candidate, "ana@example.com");
  assert.equal(saved[0].type, "application_received");
  assert.equal(saved[0].subject, "Recibimos tu aplicación");
  assert.equal(saved[0].html, "<p>hola</p>");
  assert.equal(saved[0].error, "Gmail no conectado");
  assert.ok(saved[0].error);
  const pub = candidateMailStatus(result);
  assert.deepEqual(pub, { status: "pending" });
  assert.equal("error" in pub, false);
});

test("an invalid token is queued, and the candidate status hides the provider error", async () => {
  let savedError = "";
  const result = await deliverCandidateMail(
    {
      to: "ana@example.com",
      type: "application_status",
      subject: "Oferta",
      html: "<p>oferta</p>",
    },
    {
      send: async () => {
        throw new Error("Google token refresh failed: 400 invalid_grant");
      },
      savePending: async (row) => {
        savedError = row.error;
        return { id: "pending-2" };
      },
      recordSend: async () => 0,
    },
  );
  assert.equal(result.status, "pending");
  assert.match(savedError, /invalid_grant/);
  assert.deepEqual(candidateMailStatus(result), { status: "pending" });
});

test("reenviar pendientes sends each pending email once", async () => {
  type Row = ClaimedMail & { status: string };
  const rows: Row[] = [
    { id: "1", status: "pending", candidate: "a@example.com", type: "assessment_invite", subject: "Evaluación", html: "<p>1</p>", reply_to: null, bcc: null, error: "down" },
    { id: "2", status: "pending", candidate: "b@example.com", type: "battery_invite", subject: "Batería", html: "<p>2</p>", reply_to: "jointheteam@tradingsolutions.com", bcc: null, error: "down" },
  ];
  const sent: string[] = [];
  const claimPending = async () => {
    const batch = rows.filter((row) => row.status === "pending");
    for (const row of batch) row.status = "sending";
    return batch.map((row) => ({ ...row }));
  };
  const deps = {
    claimPending,
    send: async (row: ClaimedMail) => {
      sent.push(row.id);
      const again = await claimPending();
      assert.equal(again.length, 0);
      return { ok: true as const, gmail_id: `gmail-${row.id}` };
    },
    markSent: async (id: string) => {
      const row = rows.find((item) => item.id === id);
      if (row) row.status = "sent";
    },
    markPending: async (id: string, error: string) => {
      const row = rows.find((item) => item.id === id);
      if (!row) return;
      row.status = "pending";
      row.error = error;
    },
    recordSend: async () => sent.length,
  };
  const first = await resendPendingOnce(deps);
  const second = await resendPendingOnce(deps);
  assert.deepEqual(first, { sent: 2, pending: 0 });
  assert.deepEqual(second, { sent: 0, pending: 0 });
  assert.deepEqual(sent, ["1", "2"]);
  assert.deepEqual(rows.map((row) => row.status), ["sent", "sent"]);
});

test("a failed replay stays pending and the next replay sends it once", async () => {
  const row = {
    id: "9",
    status: "pending",
    candidate: "c@example.com",
    type: "rejection_resend",
    subject: "Sobre tu aplicación",
    html: "<p>no</p>",
    reply_to: null,
    bcc: null,
    error: "Gmail no conectado",
  };
  let attempts = 0;
  const deps = {
    claimPending: async () => {
      if (row.status !== "pending") return [];
      row.status = "sending";
      return [{ ...row }];
    },
    send: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false as const, error: "token invalid" };
      return { ok: true as const, gmail_id: "gmail-9" };
    },
    markSent: async () => {
      row.status = "sent";
    },
    markPending: async (_id: string, error: string) => {
      row.status = "pending";
      row.error = error;
    },
    recordSend: async () => 1,
  };
  const first = await resendPendingOnce(deps);
  assert.deepEqual(first, { sent: 0, pending: 1 });
  assert.equal(row.status, "pending");
  assert.equal(row.error, "token invalid");
  const second = await resendPendingOnce(deps);
  assert.deepEqual(second, { sent: 1, pending: 0 });
  assert.equal(attempts, 2);
  assert.equal(row.status, "sent");
});

test("From is the team mailbox and the daily warning starts after 1500", () => {
  assert.equal(atsFromHeader(), `${ATS_FROM_NAME} <${ATS_FROM_EMAIL}>`);
  assert.equal(atsFromHeader(), "Talent Acquisition Team <jointheteam@tradingsolutions.com>");
  const gmail = readFileSync(join(root, "src/lib/gmail.ts"), "utf8");
  assert.match(gmail, /return atsFromHeader\(ATS_FROM_EMAIL\)/);
  const store = readFileSync(join(root, "src/lib/ats-mail-store.ts"), "utf8");
  assert.match(store, /sendViaGmail\(/);
  assert.doesNotMatch(store, /EMAIL_FROM/);
  assert.equal(dailySendWarning(1500), false);
  assert.equal(dailySendWarning(1501), true);
  assert.equal(
    mailboxDisconnectedBanner(3),
    "Buzón jointheteam@ desconectado — 3 correos pendientes. Reconectar",
  );
});

test("battery direct send uses Gmail and the HR banner names the pending mailbox", () => {
  const enviar = readFileSync(join(root, "src/app/api/bateria/enviar/route.ts"), "utf8");
  const invitar = readFileSync(join(root, "src/lib/bateria/invitar.ts"), "utf8");
  const banner = readFileSync(join(root, "src/components/MailboxBanner.tsx"), "utf8");
  assert.match(enviar, /sendCandidateMail\(/);
  assert.match(invitar, /sendCandidateMail\(/);
  assert.doesNotMatch(enviar, /resend/i);
  assert.doesNotMatch(invitar, /resend/i);
  assert.match(banner, /Buzón jointheteam@ desconectado —/);
  assert.match(banner, /correos pendientes/);
  assert.match(banner, /Reconectar/);
  assert.match(banner, /Reenviar pendientes/);
  assert.match(banner, /Más de 1500 envíos hoy/);
  const migration = readFileSync(join(root, "supabase/migrations/20261030_ats_outbound_mail.sql"), "utf8");
  assert.match(migration, /ats_outbound_mail/);
  assert.match(migration, /ats_mail_forbid_delete/);
  assert.doesNotMatch(migration, /DELETE FROM/i);
});
