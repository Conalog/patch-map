import { defaultRoundedRect, generateTexture } from '../utils';

export const base = (app, { fill, borderWidth = 2, borderColor, radius }) => {
  const frame = defaultRoundedRect({ fill, borderWidth, borderColor, radius });
  return generateTexture(app, { target: frame, borderWidth });
};
