import { UPDATE_STAGES } from './constants';
import { splitText } from './utils';

const KEYS = ['text', 'split'];

export const Textable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyText(relevantChanges) {
      const { text, split } = relevantChanges;
      const fullText = splitText(text, split);

      if (this.bitmapText) {
        this.bitmapText.text = fullText;
      } else {
        this.text = fullText;
      }
      this._fullText = fullText;
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
