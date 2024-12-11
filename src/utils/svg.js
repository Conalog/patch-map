export const convertBase64SVG = (svg) => {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

export const getSVGSource = (svg) => {
  return svg.startsWith('<svg') ? convertBase64SVG(svg) : svg;
};