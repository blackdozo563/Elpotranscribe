import { expect, test } from "vitest";
import { bytes, number, checkedDate } from "../src/format";
test("tailles décimales françaises, sans estimation et sans confondre Mo et Mio", () => {
  expect(bytes(19300000)).toMatch(/^19,3\sMo$/);
  expect(bytes(0)).toMatch(/^0\so$/);
  expect(number(1234)).toMatch(/^1\s234$/);
});
test("vérification relative : aujourd’hui, hier, date ancienne et date absente", () => {
  const now = new Date(2026, 9, 15, 12).getTime();
  expect(checkedDate(now, now)).toContain("aujourd’hui");
  expect(checkedDate(new Date(2026, 9, 14, 23).getTime(), now)).toBe(
    "vérifié hier",
  );
  expect(checkedDate(new Date(2026, 8, 1).getTime(), now)).toBe(
    "vérifié le 01/09/2026",
  );
  expect(checkedDate(0, now)).toBe("Date de vérification inconnue");
});
