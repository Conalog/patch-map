/// Retained edits and command availability for the attached diagram.
/// Counts include committed edits. Commands are unavailable during a commit.
typedef PatchMapEditHistoryState = ({
  int undoDepth,
  int redoDepth,
  bool canUndo,
  bool canRedo,
  bool isBusy,
});

const PatchMapEditHistoryState emptyEditHistoryState = (
  undoDepth: 0,
  redoDepth: 0,
  canUndo: false,
  canRedo: false,
  isBusy: false,
);
