export const renderInspectorFields = ({
  container,
  node,
  id,
  data,
  resolved,
  addField,
  addInlineFields,
  addColorField,
  formatPxPercent,
  renderRelationsEditor,
  renderGridEditor,
}) => {
  addField('Id', data.id, { readOnly: true });
  addField('Type', data.type ?? '', { readOnly: true });
  addField('Label', data.label ?? '', { path: 'label', type: 'text' });
  addField('Show', data.show ?? true, { path: 'show', type: 'boolean' });

  if (typeof data.text === 'string') {
    addField('Text', data.text, { path: 'text', type: 'text' });
  }

  if (typeof data.source === 'string') {
    addField('Source', data.source, { path: 'source', type: 'text' });
  }

  if (data.tint != null) {
    addColorField('Tint', data.tint, 'tint');
  }

  if (data.type !== 'relations' && resolved.kind === 'element') {
    addField('X', data.attrs?.x ?? '', {
      path: 'attrs.x',
      type: 'number',
      originalValue: data.attrs?.x,
    });
    addField('Y', data.attrs?.y ?? '', {
      path: 'attrs.y',
      type: 'number',
      originalValue: data.attrs?.y,
    });
    if (data.attrs?.angle != null) {
      addField('Angle', data.attrs.angle ?? '', {
        path: 'attrs.angle',
        type: 'number',
        originalValue: data.attrs?.angle,
      });
    }
    if (data.attrs?.rotation != null) {
      addField('Rot', data.attrs.rotation ?? '', {
        path: 'attrs.rotation',
        type: 'number',
        originalValue: data.attrs?.rotation,
      });
    }
  }

  if (data.size != null) {
    if (resolved.kind === 'component') {
      const widthValue = formatPxPercent(data.size?.width);
      const heightValue = formatPxPercent(data.size?.height);
      addInlineFields('Size', [
        {
          short: 'W',
          value: widthValue ?? '',
          path: 'size.width',
          type: 'text',
        },
        {
          short: 'H',
          value: heightValue ?? '',
          path: 'size.height',
          type: 'text',
        },
      ]);
    } else {
      addInlineFields('Size', [
        {
          short: 'W',
          value: data.size?.width ?? '',
          path: 'size.width',
          type: 'number',
          originalValue: data.size?.width,
        },
        {
          short: 'H',
          value: data.size?.height ?? '',
          path: 'size.height',
          type: 'number',
          originalValue: data.size?.height,
        },
      ]);
    }
  }

  if (data.gap != null) {
    addInlineFields('Gap', [
      {
        short: 'X',
        value: data.gap?.x ?? '',
        path: 'gap.x',
        type: 'number',
        originalValue: data.gap?.x,
      },
      {
        short: 'Y',
        value: data.gap?.y ?? '',
        path: 'gap.y',
        type: 'number',
        originalValue: data.gap?.y,
      },
    ]);
  }

  if (data.padding != null && resolved.kind === 'element') {
    addInlineFields('Pad', [
      {
        short: 'T',
        value: data.padding?.top ?? '',
        path: 'padding.top',
        type: 'number',
        originalValue: data.padding?.top,
      },
      {
        short: 'R',
        value: data.padding?.right ?? '',
        path: 'padding.right',
        type: 'number',
        originalValue: data.padding?.right,
      },
      {
        short: 'B',
        value: data.padding?.bottom ?? '',
        path: 'padding.bottom',
        type: 'number',
        originalValue: data.padding?.bottom,
      },
      {
        short: 'L',
        value: data.padding?.left ?? '',
        path: 'padding.left',
        type: 'number',
        originalValue: data.padding?.left,
      },
    ]);
  }

  if (data.placement && resolved.kind === 'component') {
    addField('Place', data.placement, {
      path: 'placement',
      type: 'text',
      options: [
        { value: 'left', label: 'left' },
        { value: 'left-top', label: 'left-top' },
        { value: 'left-bottom', label: 'left-bottom' },
        { value: 'top', label: 'top' },
        { value: 'right', label: 'right' },
        { value: 'right-top', label: 'right-top' },
        { value: 'right-bottom', label: 'right-bottom' },
        { value: 'bottom', label: 'bottom' },
        { value: 'center', label: 'center' },
      ],
    });
  }

  if (data.margin && resolved.kind === 'component') {
    addInlineFields('Margin', [
      {
        short: 'T',
        value: data.margin?.top ?? '',
        path: 'margin.top',
        type: 'number',
        originalValue: data.margin?.top,
      },
      {
        short: 'R',
        value: data.margin?.right ?? '',
        path: 'margin.right',
        type: 'number',
        originalValue: data.margin?.right,
      },
      {
        short: 'B',
        value: data.margin?.bottom ?? '',
        path: 'margin.bottom',
        type: 'number',
        originalValue: data.margin?.bottom,
      },
      {
        short: 'L',
        value: data.margin?.left ?? '',
        path: 'margin.left',
        type: 'number',
        originalValue: data.margin?.left,
      },
    ]);
  }

  if (
    (data.type === 'background' || data.type === 'bar') &&
    data.source &&
    typeof data.source === 'object'
  ) {
    addColorField('Fill', data.source.fill ?? '', 'source.fill');
    addColorField(
      'Border',
      data.source.borderColor ?? '',
      'source.borderColor',
    );
    addField('B Width', data.source.borderWidth ?? '', {
      path: 'source.borderWidth',
      type: 'number',
      originalValue: data.source.borderWidth,
    });
    if (typeof data.source.radius === 'number') {
      addField('Radius', data.source.radius ?? '', {
        path: 'source.radius',
        type: 'number',
        originalValue: data.source.radius,
      });
    } else if (data.source.radius && typeof data.source.radius === 'object') {
      addInlineFields('Radius', [
        {
          short: 'TL',
          value: data.source.radius.topLeft ?? '',
          path: 'source.radius.topLeft',
          type: 'number',
          originalValue: data.source.radius.topLeft,
        },
        {
          short: 'TR',
          value: data.source.radius.topRight ?? '',
          path: 'source.radius.topRight',
          type: 'number',
          originalValue: data.source.radius.topRight,
        },
        {
          short: 'BR',
          value: data.source.radius.bottomRight ?? '',
          path: 'source.radius.bottomRight',
          type: 'number',
          originalValue: data.source.radius.bottomRight,
        },
        {
          short: 'BL',
          value: data.source.radius.bottomLeft ?? '',
          path: 'source.radius.bottomLeft',
          type: 'number',
          originalValue: data.source.radius.bottomLeft,
        },
      ]);
    }
  }

  if (data.type === 'relations' && data.style?.color != null) {
    addColorField('Color', data.style.color ?? '', 'style.color');
  }

  if (data.type === 'relations' && data.style?.width != null) {
    addField('Width', data.style.width ?? '', {
      path: 'style.width',
      type: 'number',
      originalValue: data.style.width,
    });
  }

  if (data.type === 'text') {
    addField('Split', data.split ?? '', {
      path: 'split',
      type: 'number',
      originalValue: data.split,
    });
    addField('F Size', data.style?.fontSize ?? '', {
      path: 'style.fontSize',
      type: 'text',
    });
    addField('F Weight', data.style?.fontWeight ?? '', {
      path: 'style.fontWeight',
      type: 'text',
    });
    addField('F Family', data.style?.fontFamily ?? '', {
      path: 'style.fontFamily',
      type: 'text',
    });
    addColorField('Fill', data.style?.fill ?? '', 'style.fill');
    addField('Wrap', data.style?.wordWrapWidth ?? '', {
      path: 'style.wordWrapWidth',
      type: 'text',
    });
    addField('Overflow', data.style?.overflow ?? '', {
      path: 'style.overflow',
      type: 'text',
      options: [
        { value: 'visible', label: 'visible' },
        { value: 'hidden', label: 'hidden' },
        { value: 'ellipsis', label: 'ellipsis' },
      ],
    });
    addInlineFields('Auto', [
      {
        short: 'Min',
        value: data.style?.autoFont?.min ?? '',
        path: 'style.autoFont.min',
        type: 'number',
        originalValue: data.style?.autoFont?.min,
      },
      {
        short: 'Max',
        value: data.style?.autoFont?.max ?? '',
        path: 'style.autoFont.max',
        type: 'number',
        originalValue: data.style?.autoFont?.max,
      },
    ]);
  }

  if (data.type === 'bar') {
    addField('Anim', data.animation ?? true, {
      path: 'animation',
      type: 'boolean',
    });
    addField('Anim Ms', data.animationDuration ?? '', {
      path: 'animationDuration',
      type: 'number',
      originalValue: data.animationDuration,
    });
  }

  if (data.type === 'grid') {
    addInlineFields('Item Size', [
      {
        short: 'W',
        value: data.item?.size?.width ?? '',
        path: 'item.size.width',
        type: 'number',
        originalValue: data.item?.size?.width,
      },
      {
        short: 'H',
        value: data.item?.size?.height ?? '',
        path: 'item.size.height',
        type: 'number',
        originalValue: data.item?.size?.height,
      },
    ]);
    addInlineFields('Item Pad', [
      {
        short: 'T',
        value: data.item?.padding?.top ?? '',
        path: 'item.padding.top',
        type: 'number',
        originalValue: data.item?.padding?.top,
      },
      {
        short: 'R',
        value: data.item?.padding?.right ?? '',
        path: 'item.padding.right',
        type: 'number',
        originalValue: data.item?.padding?.right,
      },
      {
        short: 'B',
        value: data.item?.padding?.bottom ?? '',
        path: 'item.padding.bottom',
        type: 'number',
        originalValue: data.item?.padding?.bottom,
      },
      {
        short: 'L',
        value: data.item?.padding?.left ?? '',
        path: 'item.padding.left',
        type: 'number',
        originalValue: data.item?.padding?.left,
      },
    ]);
  }

  if (data.type === 'relations') {
    renderRelationsEditor(container, node, id);
  }

  if (data.type === 'grid') {
    renderGridEditor(container, node, id);
  }
};
