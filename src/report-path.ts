import { createHash } from "crypto";

const MAX_ARTIFACT_NAME_LENGTH = 255;

/**
 * Converts a branch or contract path into the portable subset accepted by
 * GitHub Actions artifact names.
 */
export function sanitizeArtifactPart(value: string): string {
  const sanitized = value
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  return sanitized || "artifact";
}

/**
 * Builds a stable, bounded artifact name for a contract report.
 *
 * The readable contract path is retained for diagnostics while a short hash
 * keeps similarly named contracts distinct after sanitization/truncation.
 */
export function getReportPath(branch: string, contractPath: string): string {
  const branchPart = sanitizeArtifactPart(branch);
  const contractPart = sanitizeArtifactPart(contractPath);
  const contractHash = createHash("sha256").update(contractPath).digest("hex").slice(0, 12);
  const suffix = `-${contractHash}.json`;
  const prefix = `${branchPart}.${contractPart}`;
  const availablePrefixLength = Math.max(1, MAX_ARTIFACT_NAME_LENGTH - suffix.length);

  return `${prefix.slice(0, availablePrefixLength)}${suffix}`;
}
