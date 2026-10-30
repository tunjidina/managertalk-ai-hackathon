// src/engine/s02/rubricVersion.ts
//
// Identifies the rule set that produced an MT-S02 score. Bump it whenever a
// marker list, threshold or tier rule changes, so results from different
// rule sets are never compared as if they were the same measure.

export const S02_RUBRIC_VERSION = 'mt-s02-rules-v1';
