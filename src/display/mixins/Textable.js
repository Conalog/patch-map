import { UPDATE_STAGES } from './constants';
import { splitText } from './utils';

const KEYS = ['text', 'split'];

export const Textable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyText(relevantChanges) {
      const { text, split } = relevantChanges;
      this._fullText = splitText(text, split);
      this.text = this._fullText;
      this._isTruncated = false;
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyText,
    UPDATE_STAGES.RENDER,
  );
  return MixedClass;
};
