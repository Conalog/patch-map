import { Container } from 'pixi.js';

export type TransformableElement = Container & {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
};

const normalizeElements = (
  value: TransformableElement | readonly TransformableElement[],
): TransformableElement[] =>
  value instanceof Container ? [value] : [...value];

export interface TransformerOptions {
  elements?: TransformableElement | TransformableElement[];
  wireframeStyle?: { thickness?: number; color?: string };
  boundsDisplayMode?: 'all' | 'groupOnly' | 'elementOnly' | 'none';
  resizeHandles?: boolean;
  rotateHandles?: boolean;
  transformHistory?: boolean;
  resizeKeepRatio?: boolean;
  getResizeKeepRatio?: (context: Record<string, unknown>) => boolean;
}

export class SelectionModel {
  #elements: TransformableElement[] = [];
  readonly #onChange: (
    current: TransformableElement[],
    added: TransformableElement[],
    removed: TransformableElement[],
  ) => void;

  public constructor(
    onChange: (
      current: TransformableElement[],
      added: TransformableElement[],
      removed: TransformableElement[],
    ) => void,
  ) {
    this.#onChange = onChange;
  }

  public get elements(): readonly TransformableElement[] {
    return this.#elements;
  }

  public add(value: TransformableElement | readonly TransformableElement[]): void {
    const additions = normalizeElements(value).filter(
      (element) => !this.#elements.includes(element),
    );
    if (!additions.length) return;
    this.#elements = [...this.#elements, ...additions];
    this.#onChange([...this.#elements], additions, []);
  }

  public remove(value: TransformableElement | readonly TransformableElement[]): void {
    const candidates = new Set(normalizeElements(value));
    const removed = this.#elements.filter((element) => candidates.has(element));
    if (!removed.length) return;
    this.#elements = this.#elements.filter((element) => !candidates.has(element));
    this.#onChange([...this.#elements], [], removed);
  }

  public set(value: TransformableElement | readonly TransformableElement[] | null): void {
    const next = [...new Set(value === null ? [] : normalizeElements(value))];
    const added = next.filter((element) => !this.#elements.includes(element));
    const removed = this.#elements.filter((element) => !next.includes(element));
    if (!added.length && !removed.length) return;
    this.#elements = next;
    this.#onChange([...next], added, removed);
  }

  public clear(): void {
    this.set([]);
  }
}

export class Transformer extends Container {
  public readonly selection: SelectionModel;
  public readonly options: Readonly<
    Required<Omit<TransformerOptions, 'elements' | 'getResizeKeepRatio'>> & {
      getResizeKeepRatio: TransformerOptions['getResizeKeepRatio'] | undefined;
    }
  >;

  public constructor(options: TransformerOptions = {}) {
    super();
    this.options = {
      wireframeStyle: { thickness: 1.5, color: '#1099FF', ...options.wireframeStyle },
      boundsDisplayMode: options.boundsDisplayMode ?? 'all',
      resizeHandles: options.resizeHandles ?? false,
      rotateHandles: options.rotateHandles ?? false,
      transformHistory: options.transformHistory ?? false,
      resizeKeepRatio: options.resizeKeepRatio ?? false,
      getResizeKeepRatio: options.getResizeKeepRatio,
    };
    this.selection = new SelectionModel((current, added, removed) => {
      this.emit('update_elements', { current, added, removed });
    });
    if (options.elements) this.selection.set(options.elements);
  }

  public get elements(): TransformableElement[] {
    return [...this.selection.elements];
  }

  public set elements(value: TransformableElement | TransformableElement[]) {
    this.selection.set(value);
  }

  public override destroy(): void {
    this.selection.clear();
    this.removeAllListeners();
    super.destroy({ children: true });
  }
}
