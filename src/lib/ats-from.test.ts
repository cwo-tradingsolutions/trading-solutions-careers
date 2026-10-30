import assert from "node:assert/strict";
import { test } from "node:test";
import { ATS_FROM_EMAIL, ATS_FROM_NAME, atsFromHeader, encodeMailboxDisplayName } from "./ats-from";

const HEADER = `${ATS_FROM_NAME} <${ATS_FROM_EMAIL}>`;

test("From is Talent Acquisition Team at jointheteam, even if the caller passes Kelly or mojibake", () => {
  assert.equal(atsFromHeader(), HEADER);
  assert.equal(atsFromHeader("kcastaneda10@gmail.com"), `Talent Acquisition Team <kcastaneda10@gmail.com>`);
  for (const raw of [
    undefined,
    "",
    "Kelly Castañeda",
    "Kelly Castaneda",
    "Kelly CastaÃ±eda",
    "Kelly CastaÃƒÂ±eda",
    "Trading Solutions ATS",
  ]) {
    assert.equal(encodeMailboxDisplayName(raw), ATS_FROM_NAME);
  }
  assert.equal(atsFromHeader(ATS_FROM_EMAIL), HEADER);
  assert.doesNotMatch(HEADER, /Kelly|Casta|Ã|=\?UTF-8/i);
  assert.match(HEADER, /^Talent Acquisition Team <jointheteam@tradingsolutions.com>$/);
});
