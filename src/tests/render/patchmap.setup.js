import { afterEach, beforeEach } from 'vitest';
import { Patchmap } from '../../patchmap';

export const setupPatchmapTests = () => {
  let patchmap;
  let element;

  beforeEach(async () => {
    document.body.innerHTML = '';
    element = document.createElement('div');
    element.style.height = '100svh';
    document.body.appendChild(element);

    patchmap = new Patchmap();
    await patchmap.init(element);
  });

  afterEach(() => {
    if (patchmap) {
      patchmap.destroy();
    }
    if (element?.parentElement) {
      document.body.removeChild(element);
    }
  });

  return {
    getPatchmap: () => patchmap,
  };
};
