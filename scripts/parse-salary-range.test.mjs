/**
 * Pure checks for parseSalaryRangeUsd in the prefilter route.
 * No test runner: `node scripts/parse-salary-range.test.mjs`
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(
  join(here, "../src/app/api/headhunting/prefilter/[token]/route.ts"),
  "utf8",
);
const start = route.indexOf("function parseSalaryRangeUsd");
const end = route.indexOf("\nconst TS_LINKEDIN_URL", start);
if (start < 0 || end < 0) {
  console.error("parseSalaryRangeUsd not found in the prefilter route");
  process.exit(1);
}
const fnSrc = route.slice(start, end).replace(
  /function parseSalaryRangeUsd\(raw: unknown\): \{ min: number; max: number \} \| null/,
  "function parseSalaryRangeUsd(raw)",
);
const parseSalaryRangeUsd = new Function(`${fnSrc}\nreturn parseSalaryRangeUsd;`)();

function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
    process.exitCode = 1;
  } else {
    console.log(`ok ${label}`);
  }
}

eq(parseSalaryRangeUsd("2.300"), { min: 2300, max: 2300 }, "2.300");
eq(parseSalaryRangeUsd("2,300"), { min: 2300, max: 2300 }, "2,300");
eq(parseSalaryRangeUsd("USD 2300"), { min: 2300, max: 2300 }, "USD 2300");
eq(parseSalaryRangeUsd("1800-2000"), { min: 1800, max: 2000 }, "1800-2000");
eq(parseSalaryRangeUsd("1.500,00"), { min: 1500, max: 1500 }, "1.500,00");
eq(parseSalaryRangeUsd("a convenir"), null, "a convenir");
eq(parseSalaryRangeUsd("5000-6000"), { min: 5000, max: 6000 }, "5000-6000");

if (process.exitCode) process.exit(process.exitCode);
console.log("parseSalaryRangeUsd: all cases passed");
