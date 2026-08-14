import { WalletBehaviourEvidence, WalletBehaviourIdentity, WalletRecentBehaviourState, WalletTokenRole } from '../../models/index.js';
import { resolveDisplayIdentity, getRecentBehaviour } from '../../services/identityResolver.js';

export async function behaviourEvaluationController(req, res, next) {
  try {
    const { wallet } = req.params;
    const evidence = await WalletBehaviourEvidence.find({ walletAddress: wallet }).sort({ computedAt: -1 }).lean();
    const identity = await WalletBehaviourIdentity.findById(wallet).lean();
    const recent = await WalletRecentBehaviourState.find({ walletAddress: wallet }).sort({ windowEnd: -1 }).lean();
    const latestEvidence = evidence[0] || null;
    return res.json({
      wallet,
      lifetimeFeatures: latestEvidence?.supportingFeatures || null,
      recentStates: recent,
      migrationSpecialistScore: latestEvidence?.migrationSpecialistScore || null,
      scalperScore: latestEvidence?.scalperScore || null,
      evidenceSufficiency: latestEvidence?.evidenceStrength || null,
      persistentIdentity: identity ? { primary_behaviour_key: identity.primaryBehaviourKey } : { primary_behaviour_key: 'unknown' },
      recentDominantBehaviour: recent[0] || null,
      coverage: latestEvidence?.coveragePct || null,
      quality: latestEvidence?.qualityStatus || 'unavailable',
      transitionReason: null,
      automaticClassification: { enabled: false, reason: 'automatic_classification_disabled_pending_empirical_calibration' },
    });
  } catch (exc) {
    return next(exc);
  }
}

export async function identityDebugController(req, res, next) {
  try {
    const { mint, wallet } = req.params;
    const identity = await WalletBehaviourIdentity.findById(wallet).lean();
    const recent = await getRecentBehaviour(wallet, 30);
    const roles = await WalletTokenRole.find({ walletAddress: wallet, tokenMint: mint }).lean();
    const display = await resolveDisplayIdentity(wallet, mint);
    return res.json({
      wallet, token: mint,
      persistentAladdinBehaviour: identity ? { primary_behaviour_key: identity.primaryBehaviourKey } : { primary_behaviour_key: 'unknown' },
      recentBehaviour: recent, tokenSpecificRoles: roles, displayIdentity: display, precedenceReason: display.reason,
    });
  } catch (exc) {
    return next(exc);
  }
}
