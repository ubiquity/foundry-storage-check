import { expect } from "@jest/globals";

import { getReportPath, sanitizeArtifactPart } from "../src/report-path";

describe("artifact report paths", () => {
  it("sanitizes path separators and unsupported characters", () => {
    expect(sanitizeArtifactPart("feature/985:storage\\layout")).toBe("feature-985-storage-layout");
  });

  it("creates a valid, stable name for contract reports", () => {
    const contract = "packages/contracts/src/dollar/libraries/LibStaking.sol:LibStaking";
    const report = getReportPath("feature/985", contract);

    expect(report).toMatch(/^feature-985\.packages-contracts-src-dollar-libraries-LibStaking\.sol-LibStaking-[a-f0-9]{12}\.json$/);
    expect(report).not.toMatch(/[\\/:]/);
    expect(report.length).toBeLessThanOrEqual(255);
  });

  it("keeps distinct contract paths distinct after sanitization", () => {
    const first = getReportPath("main", "src/Lib.sol:Storage");
    const second = getReportPath("main", "src\\Lib.sol:Storage");

    expect(first).not.toBe(second);
  });

  it("bounds very long branch and contract names", () => {
    const report = getReportPath("feature/" + "x".repeat(300), "src/" + "y".repeat(300) + ".sol:Storage");

    expect(report.length).toBeLessThanOrEqual(255);
    expect(report.endsWith(".json")).toBe(true);
  });
});
