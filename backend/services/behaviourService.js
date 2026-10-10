import crypto from 'crypto';
import { WalletBehaviourIdentity, WalletBehaviourIdentityHistory, WalletBehaviourEvidence, WalletRecentBehaviourState, BehaviourDefinition } from '../models/index.js';

const SUPPORTED_BEHAVIOURS = new Set(['migration_specialist', 'scalper', 'unknown']);
const CALIBRATION_PENDING_REASON = 'automatic_classification_disabled_pending_empirical_calibration';

export function stableId(...parts) {
  return crypto.createHash('sha256').update(parts.map(p => String(p || '')).join('|')).digest('hex');
}

export async function ensureDefinitions() {
  const now = new Date();
  const definitions = [
    { _id: 'migration_specialist:v1', key: 'migration_specialist', version: 'v1', name: 'Migration Specialist', description: 'Dominant observed participation in pre-migration to migration to post-migration lifecycle patterns.', featureRequirements: { thresholds: 'pending_calibration' }, ruleConfiguration: { dominanceThreshold: null, minimumEvidenceThreshold: null, automaticAssignmentEnabled: false, calibrationStatus: 'pending' }, observationWindowDays: null, status: 'active', validFrom: now },
    { _id: 'scalper:v1', key: 'scalper', version: 'v1', name: 'Scalper', description: 'Dominant observed repeated short-duration entry and exit cycles.', featureRequirements: { thresholds: 'pending_calibration' }, ruleConfiguration: { shortDurationSeconds: null, dominanceThreshold: null, minimumEvidenceThreshold: null, automaticAssignmentEnabled: false, calibrationStatus: 'pending' }, observationWindowDays: null, status: 'active', validFrom: now },
    { _id: 'unknown:v1', key: 'unknown', version: 'v1', name: 'Unknown', description: 'Insufficient evidence for a supported Aladdin behavioural identity.', featureRequirements: {}, ruleConfiguration: {}, observationWindowDays: null, status: 'active', validFrom: now },
  ];
  for (const def of definitions) {
    await BehaviourDefinition.findOneAndUpdate({ key: def.key, version: def.version }, { $set: def }, { upsert: true });
  }
}

export async function recordEvidence(wallet, scope, features, windowStart = null, windowEnd = null) {
  const evidenceId = stableId(wallet, scope, windowStart, windowEnd, new Date().toISOString());
  const doc = {
    _id: evidenceId, walletAddress: wallet, scope, windowStart, windowEnd,
    migrationSpecialistScore: features.migration_specialist_score ?? features.migrationSpecialistScore ?? null,
    scalperScore: features.scalper_score ?? features.scalperScore ?? null,
    evidenceStrength: features.evidence_strength ?? features.evidenceStrength ?? null,
    coveragePct: features.coverage_pct ?? features.coveragePct ?? null,
    episodesObserved: Number(features.episodes_observed ?? features.episodesObserved ?? 0),
    tokensObserved: Number(features.tokens_observed ?? features.tokensObserved ?? 0),
    supportingFeatures: features,
    qualityStatus: features.quality_status || features.qualityStatus || 'partial',
    qualityReasons: features.quality_reasons || features.qualityReasons || [],
  };
  await WalletBehaviourEvidence.create(doc);
  return evidenceId;
}

export function resolveIdentityCandidate(features) {
  const migrationScore = Number(features.migration_specialist_score ?? features.migrationSpecialistScore ?? 0);
  const scalperScore = Number(features.scalper_score ?? features.scalperScore ?? 0);
  let candidate = 'unknown';
  if (migrationScore > scalperScore) candidate = 'migration_specialist';
  else if (scalperScore > migrationScore) candidate = 'scalper';
  return { selectedBehaviourKey: 'unknown', candidateBehaviourKey: candidate, automaticAssignmentEnabled: false, selectionReason: CALIBRATION_PENDING_REASON };
}

export async function setIdentityFromEvidence(wallet, features, reason = CALIBRATION_PENDING_REASON) {
  const decision = resolveIdentityCandidate(features);
  await recordEvidence(wallet, 'lifetime', features);
  await setPersistentIdentity(wallet, decision.selectedBehaviourKey, reason, { ...features, ...decision });
  return decision;
}

export async function setPersistentIdentity(wallet, behaviourKey, reason, evidence = {}, version = 'v1') {
  if (!SUPPORTED_BEHAVIOURS.has(behaviourKey)) throw new Error(`Unsupported Aladdin behaviour: ${behaviourKey}`);
  const now = new Date();
  const existing = await WalletBehaviourIdentity.findById(wallet);
  const previous = existing ? existing.primaryBehaviourKey : null;
  const doc = {
    primaryBehaviourKey: behaviourKey,
    primaryBehaviourVersion: version,
    identityStatus: behaviourKey !== 'unknown' ? 'established' : 'unknown',
    evidenceStrength: evidence.evidenceStrength ?? evidence.evidence_strength ?? null,
    coveragePct: evidence.coveragePct ?? evidence.coverage_pct ?? null,
    episodesObserved: Number(evidence.episodesObserved ?? evidence.episodes_observed ?? 0),
    tokensObserved: Number(evidence.tokensObserved ?? evidence.tokens_observed ?? 0),
    supportingFeatures: evidence,
    establishedAt: existing?.establishedAt || now,
    lastConfirmedAt: now,
    qualityStatus: evidence.qualityStatus || evidence.quality_status || 'partial',
  };
  await WalletBehaviourIdentity.findByIdAndUpdate(wallet, { $set: { _id: wallet, ...doc } }, { upsert: true });
  if (previous !== behaviourKey) {
    await WalletBehaviourIdentityHistory.create({
      _id: stableId(wallet, previous, behaviourKey, now.toISOString()),
      walletAddress: wallet, previousBehaviourKey: previous, newBehaviourKey: behaviourKey,
      newBehaviourVersion: version, transitionReason: reason, evidenceSnapshot: evidence, changedAt: now,
    });
  }
}

export async function setRecentState(wallet, windowDays, dominantBehaviourKey, features, windowEnd = null) {
  const now = new Date();
  const end = windowEnd || now;
  const start = new Date(end.getTime() - windowDays * 86400000);
  const id = stableId(wallet, windowDays, start.toISOString(), end.toISOString());
  const doc = {
    _id: id, walletAddress: wallet, windowDays, windowStart: start, windowEnd: end,
    dominantBehaviourKey: SUPPORTED_BEHAVIOURS.has(dominantBehaviourKey) ? dominantBehaviourKey : 'unknown',
    migrationSpecialistScore: features.migration_specialist_score ?? features.migrationSpecialistScore ?? null,
    scalperScore: features.scalper_score ?? features.scalperScore ?? null,
    evidenceStrength: features.evidence_strength ?? features.evidenceStrength ?? null,
    coveragePct: features.coverage_pct ?? features.coveragePct ?? null,
    episodesObserved: Number(features.episodes_observed ?? features.episodesObserved ?? 0),
    tokensObserved: Number(features.tokens_observed ?? features.tokensObserved ?? 0),
    supportingFeatures: features,
    qualityStatus: features.quality_status || features.qualityStatus || 'partial',
    computedAt: now,
  };
  await WalletRecentBehaviourState.findOneAndUpdate(
    { walletAddress: wallet, windowDays, windowStart: start, windowEnd: end },
    { $set: doc },
    { upsert: true }
  );
}
