import '../api/result.dart';
import '../api/target.dart';
import '../dataset/dataset_reader.dart';
import '../presentation/field_operations.dart';
import '../presentation/presentation_layers.dart';
import '../presentation/presentation_admission.dart';
import '../presentation/record_delta.dart';

/// An opaque publication whose native resources are owned by the backend.
/// The backend may mutate retained handles only in its publish boundary.
abstract class SessionPublication {}

final class PreparedUpdate {
  const PreparedUpdate(this.publication, {this.failures = const {}});
  final SessionPublication publication;

  /// Failure belongs to the changed element/item; its prior publication stays.
  final Map<String, List<PatchMapFailure>> failures;
}

/// The preparation/publication lifetime boundary. Implementations must not
/// change the current drawing while constructing a candidate publication.
abstract class SessionBackend {
  void validateDocument(DatasetDocument document);
  void validateUpdate(
    DatasetDocument document,
    PresentationBatch batch,
    PresentationRecordLookup current,
  );

  /// Optional validated transaction proof. False uses ordinary validation.
  bool validateRetainedUpdate(
    DatasetDocument document,
    PresentationBatch batch,
    PresentationRecordLookup lookup,
    SessionPublication publication,
    int acceptedGeneration,
  ) => false;

  /// Returns only a proof bound to the exact current publication and plan.
  Map<PatchMapTarget, RecordDelta>? validatedChanges(
    DatasetDocument document,
    PresentationPlan plan,
    SessionPublication publication,
    int acceptedGeneration,
  ) => null;

  Map<PatchMapTarget, PresentationPatch>? validatedPatchIndex(
    DatasetDocument document,
    PresentationPlan plan,
    SessionPublication publication,
    int acceptedGeneration,
  ) => null;

  void releaseValidatedChanges() {}

  Future<SessionPublication> prepareDocument(
    DatasetDocument document,
    int generation,
  );

  /// A respecified failed source is work even when its scalar value is equal.
  bool needsRetry(SessionPublication publication, PresentationPatch patch) =>
      false;

  /// Owns a reference to its returned publication, including identity reuse.
  /// The caller pins [before] until the asynchronous operation settles.
  Future<PreparedUpdate> prepareUpdate(
    SessionPublication before,
    DatasetDocument document,
    Map<PatchMapTarget, RecordDelta> changes, {
    required int generation,
    required bool animate,
    PresentationPlan? intent,
  });

  /// Serializes intrinsic-image geometry refresh with ordinary preparations.
  Future<SessionPublication> prepareRefresh(SessionPublication before) async {
    retain(before);
    return before;
  }

  void publish(SessionPublication publication, int generation, int revision);

  /// Paint-only state. No effective data, geometry, or publication revision changes.
  void setPresentation(PresentationOpacity? opacity) {}
  void hide();
  void setActive(bool active);

  /// Acquire one publication reference without changing its visible state.
  void retain(SessionPublication publication);

  /// Release one reference and enqueue safe retirement at zero. Must not throw.
  /// Late unsubmitted candidates use this same ownership path.
  void retire(SessionPublication publication);
  void close();
}
