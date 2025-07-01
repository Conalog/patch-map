import { changeTextStyle } from './text-style';
import { isMatch, mergeProps } from './utils';

export const changeText = (
  object,
  { text = object.text, split = object.split },
  { theme },
) => {
  if (isMatch(object, { text, split })) {
    return;
  }

  object.text = splitText(text, split);

  if (object?.style?.fontSize === 'auto') {
    changeTextStyle(object, { style: { fontSize: 'auto' } }, { theme });
  }
  mergeProps(object, { text, split });

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
