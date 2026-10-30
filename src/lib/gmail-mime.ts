/** Header and MIME helpers. No network, no database. */
import { parseOneAddress } from "./mail-recipient-guard";

export function stripHeaderBreaks(value: string): string {
  return value.replace(/[\u0000\r\n]+/g, " ").replace(/[ \t]{2,}/g, " ").trim();
}

/** Same address rules as the outbound guard: dot-atom local part, IDN as punycode. */
export function isSafeMailbox(value: string): boolean {
  return parseOneAddress(value).ok;
}

/** RFC 2047 encoded-words stay at or under 75 characters and are folded. */
export function encodeSubject(subject: string): string {
  const clean = stripHeaderBreaks(subject);
  if (!clean) return "";
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  const bytes = Buffer.from(clean, "utf8");
  const words: string[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    let size = Math.min(45, bytes.length - offset);
    while (size > 1 && offset + size < bytes.length && (bytes[offset + size] & 0xc0) === 0x80) size -= 1;
    const word = `=?UTF-8?B?${bytes.subarray(offset, offset + size).toString("base64")}?=`;
    words.push(word);
    offset += size;
  }
  return words.join("\r\n ");
}

export function wrapBase64(value: Buffer | string): string {
  const raw = (Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8")).toString("base64");
  return raw.replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, "");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildAlternativeBody(html: string): { boundary: string; body: string } {
  const boundary = `ts_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const text = htmlToText(html) || " ";
  const chunks = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(html),
    `--${boundary}--`,
  ];
  return { boundary, body: chunks.join("\r\n") };
}
