import { changeTextStyle } from './text-style';
import { isConfigMatch, updateConfig } from './utils';

export const changeText = (
  object,
  { text = object.config.text, split = object.config.split },
) => {
  if (
    isConfigMatch(object, 'text', text) &&
    isConfigMatch(object, 'split', split)
  ) {
    return;
  }

  object.text = splitText(text, split);

  if (object.config?.style?.fontSize === 'auto') {
    changeTextStyle(object, { style: { fontSize: 'auto' } });
  }
  updateConfig(object, { text, split });

  function splitText(text, chunkSize) {
    if (chunkSize === 0 || chunkSize == null) {
      return text;
    }
    let result = '';
    for (let i = 0; i < text.length; i += chunkSize) {
      result += `${text.slice(i, i + chunkSize)}\n`;
    }
    return result.trim();
  }
};
