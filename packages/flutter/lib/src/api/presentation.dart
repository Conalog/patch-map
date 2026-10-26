import 'result.dart';
import 'target.dart';

/// A detached logical scope and its matched addresses for one keyed alpha layer.
///
/// Missing alpha multipliers mean 1. The presentation owner validates the entire
/// layer, including requiring at least one multiplier, before changing state.
final class PatchMapPresentationLayer {
  PatchMapPresentationLayer({
    required Iterable<PatchMapTarget> scope,
    required Iterable<PatchMapTarget> targets,
    this.matchedAlpha,
    this.unmatchedAlpha,
  }) : scope = List.unmodifiable([
         for (final target in scope)
           PatchMapTarget(target.id, componentId: target.componentId),
       ]),
       targets = List.unmodifiable([
         for (final target in targets)
           PatchMapTarget(target.id, componentId: target.componentId),
       ]);

  final List<PatchMapTarget> scope;
  final List<PatchMapTarget> targets;
  final double? matchedAlpha;
  final double? unmatchedAlpha;
}

/// Synchronous admission result; counts refer to unique logical addresses.
final class PatchMapPresentationResult {
  PatchMapPresentationResult(
    this.outcome, {
    Iterable<PatchMapFailure> failures = const [],
    this.scopeCount = 0,
    this.targetCount = 0,
    this.matchedCount = 0,
    this.ignoredTargetCount = 0,
  }) : failures = List.unmodifiable(failures);

  final PatchMapOutcome outcome;
  final List<PatchMapFailure> failures;
  final int scopeCount;
  final int targetCount;
  final int matchedCount;
  final int ignoredTargetCount;

  bool get changed => outcome == PatchMapOutcome.applied;
}
