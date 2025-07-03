import { UPDATE_STAGES } from './constants';

const KEYS = ['text', 'split'];

export const Textable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyText(relevantChanges) {
      const { text, split } = relevantChanges;
      this.text = splitText(text, split);
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyText,
    UPDATE_STAGES.RENDER,
  );
  return MixedClass;
};

const splitText = (text, split) => {
  if (split === 0) {
    return text;
  }
  let result = '';
  for (let i = 0; i < text.length; i += split) {
    result += `${text.slice(i, i + split)}\n`;
  }
  return result.trim();
};
