import type { ReworkRequest } from '@fieldconnect/shared';

export function normalizeEvidenceVersionForReview(
  version: number,
  reworkRequests: Pick<ReworkRequest, 'rework_version'>[],
): number {
  if (version <= 0) return 0;

  const requestVersions = new Set(
    reworkRequests
      .map((rw) => rw.rework_version)
      .filter((requestVersion) => requestVersion > 0),
  );

  if (requestVersions.has(version)) return version;

  const latestRequestVersion = Math.max(0, ...Array.from(requestVersions));
  return latestRequestVersion > 0 ? latestRequestVersion : 0;
}

export function evidenceSectionTitle(version: number): string {
  return version === 0 ? 'Original Submission' : 'Rework Cycle #' + version;
}
