import assert from "node:assert/strict";
import test from "node:test";
import {
  presentVacancyDetail,
  presentVacancyList,
  vacancyListQuery,
  vacancyPublishesSalary,
} from "./public-vacancy.ts";

const closed = {
  id: 18,
  status: "closed",
  title: "Cerrada",
  description: "secreta",
  requirements: "secretos",
  salary_range: "$4.000.000",
  salary_range_en: "$4,000",
};

const open = {
  id: 19,
  status: "open",
  title: "Abierta",
  description: "pública",
  requirements: "públicos",
  salary_range: "$5.000.000",
  salary_range_en: "$5,000",
};

test("anonymous vacancy list is only open roles and omits salary", () => {
  const query = vacancyListQuery({ admin: false, status: "closed", department: null });
  assert.match(query.text, /status = \$1/);
  assert.deepEqual(query.params, ["open"]);

  const rows = presentVacancyList([closed, open, { id: 17, status: "closed", salary_range: "1" }], false);
  assert.deepEqual(rows.map((row) => row.id), [19]);
  assert.equal("salary_range" in rows[0], false);
  assert.equal("salary_range_en" in rows[0], false);
  assert.equal(rows[0].description, "pública");
  assert.equal(vacancyPublishesSalary(open), false);
});

test("anonymous detail of a closed vacancy is not found", () => {
  assert.deepEqual(presentVacancyDetail(closed, false), { status: 404 });
  assert.deepEqual(presentVacancyDetail(undefined, false), { status: 404 });
  const openDetail = presentVacancyDetail(open, false);
  assert.equal(openDetail.status, 200);
  if (openDetail.status === 200) {
    assert.equal("salary_range" in openDetail.body, false);
    assert.equal(openDetail.body.title, "Abierta");
  }
});

test("an admin session keeps closed vacancies and salary", () => {
  const query = vacancyListQuery({ admin: true, status: null, department: "Ops" });
  assert.equal(query.text.includes("status"), false);
  assert.deepEqual(query.params, ["Ops"]);

  const rows = presentVacancyList([closed, open], true);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].salary_range, "$4.000.000");

  const detail = presentVacancyDetail(closed, true);
  assert.equal(detail.status, 200);
  if (detail.status === 200) assert.equal(detail.body.salary_range, "$4.000.000");
});
