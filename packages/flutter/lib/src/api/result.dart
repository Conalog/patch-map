import 'target.dart';

enum PatchMapOutcome {
  applied,
  unchanged,
  partialFailure,
  rejected,
  interrupted,
}

enum PatchMapInterruption { replaced, detached, failed }

enum PatchMapPhase { empty, preparing, ready, failed }

final class PatchMapFailure {
  const PatchMapFailure(this.code, this.message, {this.target, this.path});
  final String code, message;
  final PatchMapTarget? target;
  final String? path;
}

/// Supersession and preparation failure are independent facts.
final class PatchMapResult {
  PatchMapResult(
    this.outcome, {
    this.superseded = false,
    this.interruption,
    Iterable<PatchMapFailure> failures = const [],
  }) : failures = List.unmodifiable(failures);
  final PatchMapOutcome outcome;
  final bool superseded;
  final PatchMapInterruption? interruption;
  final List<PatchMapFailure> failures;
}
