export const componentTypes = new Set(['background', 'bar', 'icon', 'text']);

export const colorPresets = [
  { value: 'primary.default', label: 'primary.default' },
  { value: 'primary.dark', label: 'primary.dark' },
  { value: 'primary.accent', label: 'primary.accent' },
  { value: 'gray.dark', label: 'gray.dark' },
  { value: 'gray.light', label: 'gray.light' },
  { value: 'black', label: 'black' },
  { value: 'white', label: 'white' },
  { value: '#111111', label: '#111111' },
  { value: '#ffffff', label: '#ffffff' },
];

export const colorPresetValues = new Set(
  colorPresets.map((preset) => preset.value),
);
