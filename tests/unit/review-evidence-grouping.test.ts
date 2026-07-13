import { describe, expect, it } from 'vitest';
import {
  evidenceSectionTitle,
  normalizeEvidenceVersionForReview,
} from '../../apps/web/src/components/office/evidenceGrouping';

describe('review evidence grouping', () => {
  it('does not invent Rework Cycle #2 when only request version 1 exists', () => {
    const reworkRequests = [{ rework_version: 1 }];

    expect(normalizeEvidenceVersionForReview(0, reworkRequests)).toBe(0);
    expect(normalizeEvidenceVersionForReview(1, reworkRequests)).toBe(1);
    expect(normalizeEvidenceVersionForReview(2, reworkRequests)).toBe(1);
    expect(evidenceSectionTitle(1)).toBe('Rework Cycle #1');
  });

  it('keeps evidence original when no rework request exists', () => {
    expect(normalizeEvidenceVersionForReview(2, [])).toBe(0);
    expect(evidenceSectionTitle(0)).toBe('Original Submission');
  });
});
