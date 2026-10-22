import { describe, it, expect } from "vitest";
import { dateKey, warsawToIso, timeLabel } from "./model";
describe("czas treningów w Polsce", () => {
  it("konwertuje lato i zimę niezależnie od strefy urządzenia", () => {
    expect(warsawToIso("2027-07-01", "10:00")).toBe("2027-07-01T08:00:00.000Z");
    expect(warsawToIso("2027-01-01", "10:00")).toBe("2027-01-01T09:00:00.000Z");
  });
  it("odrzuca nieistniejące i podwójne godziny zmiany czasu", () => {
    expect(() => warsawToIso("2027-03-28", "02:30")).toThrow();
    expect(() => warsawToIso("2027-10-31", "02:30")).toThrow();
  });
  it("formatuje datę i godzinę w Warszawie", () => {
    expect(dateKey(new Date("2027-01-01T23:30Z"))).toBe("2027-01-02");
    expect(timeLabel("2027-07-01T08:00Z")).toBe("10:00");
  });
});
