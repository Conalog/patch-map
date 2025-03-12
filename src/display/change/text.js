import { changeTextStyle } from './text-style';
import { isConfigMatch } from './utils';

export const changeText = (
  component,
  { text = component.config.text, split = component.config.split },
) => {
  if (
    isConfigMatch(component, 'text', text) &&
    isConfigMatch(component, 'split', split)
  ) {
    return;
  }

  component.text = splitText(text, split);

  if (component.config?.style?.fontSize === 'auto') {
    changeTextStyle(component, { style: { fontSize: 'auto' } });
  }

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
