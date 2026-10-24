/**
 * Changes the editor makes to a slider, as pure functions: they return a new
 * slider and never change the one given (undo keeps the old ones).
 */
import { newId } from '../model/normalize';
import type { Layer, Slide, SliderData } from '../model/types';

export function findLayer(
  slide: Slide | undefined,
  id: string | null,
): { layer: Layer; parent: Layer | null } | null {
  if (!slide || !id) return null;
  for (const layer of slide.layers) {
    if (layer.id === id) return { layer, parent: null };
    for (const child of layer.children) if (child.id === id) return { layer: child, parent: layer };
  }
  return null;
}

export function updateSlide(
  slider: SliderData,
  index: number,
  fn: (slide: Slide) => Slide,
): SliderData {
  return { ...slider, slides: slider.slides.map((s, i) => (i === index ? fn(s) : s)) };
}

function mapLayers(layers: Layer[], id: string, fn: (layer: Layer) => Layer | null): Layer[] {
  const out: Layer[] = [];
  for (const layer of layers) {
    if (layer.id === id) {
      const next = fn(layer);
      if (next) out.push(next);
    } else if (layer.children.some((c) => c.id === id)) {
      out.push({ ...layer, children: mapLayers(layer.children, id, fn) });
    } else out.push(layer);
  }
  return out;
}

export function updateLayer(
  slider: SliderData,
  index: number,
  id: string,
  fn: (layer: Layer) => Layer,
): SliderData {
  return updateSlide(slider, index, (s) => ({ ...s, layers: mapLayers(s.layers, id, fn) }));
}

export function removeLayer(slider: SliderData, index: number, id: string): SliderData {
  return updateSlide(slider, index, (s) => ({ ...s, layers: mapLayers(s.layers, id, () => null) }));
}

/** A copy with new ids (its box's layers too). */
export function cloneLayer(layer: Layer): Layer {
  return { ...structuredClone(layer), id: newId(), children: layer.children.map(cloneLayer) };
}

export function cloneSlide(slide: Slide): Slide {
  return { ...structuredClone(slide), id: newId(), layers: slide.layers.map(cloneLayer) };
}

/** Adds a layer to the slide, or to a box of it; returns the slider. */
export function addLayer(
  slider: SliderData,
  index: number,
  layer: Layer,
  boxId?: string | null,
): SliderData {
  return updateSlide(slider, index, (s) => {
    if (boxId && layer.type !== 'box') {
      return {
        ...s,
        layers: s.layers.map((l) =>
          l.id === boxId ? { ...l, children: [...l.children, layer] } : l,
        ),
      };
    }
    return { ...s, layers: [...s.layers, layer] };
  });
}

/** Duplicates a layer next to it, slightly moved; returns the slider and the copy's id. */
export function duplicateLayer(
  slider: SliderData,
  index: number,
  id: string,
): { slider: SliderData; id: string | null } {
  const found = findLayer(slider.slides[index], id);
  if (!found) return { slider, id: null };
  const copy = cloneLayer(found.layer);
  if (!found.parent)
    copy.pos = {
      ...copy.pos,
      base: { ...copy.pos.base, x: copy.pos.base.x + 2, y: copy.pos.base.y + 3 },
    };
  const insert = (layers: Layer[]): Layer[] =>
    layers.flatMap((l) =>
      l.id === id
        ? [l, copy]
        : l.children.some((c) => c.id === id)
          ? [{ ...l, children: insert(l.children) }]
          : [l],
    );
  return {
    slider: updateSlide(slider, index, (s) => ({ ...s, layers: insert(s.layers) })),
    id: copy.id,
  };
}

/** Moves a layer one place up or down in its list (on the slide: in front or behind). */
export function moveLayer(slider: SliderData, index: number, id: string, by: -1 | 1): SliderData {
  const move = (layers: Layer[]): Layer[] => {
    const i = layers.findIndex((l) => l.id === id);
    if (i >= 0) {
      const j = i + by;
      if (j < 0 || j >= layers.length) return layers;
      const out = [...layers];
      [out[i], out[j]] = [out[j]!, out[i]!];
      return out;
    }
    return layers.map((l) =>
      l.children.some((c) => c.id === id) ? { ...l, children: move(l.children) } : l,
    );
  };
  return updateSlide(slider, index, (s) => ({ ...s, layers: move(s.layers) }));
}

export function moveSlide(slider: SliderData, index: number, by: -1 | 1): SliderData {
  const j = index + by;
  if (j < 0 || j >= slider.slides.length) return slider;
  const slides = [...slider.slides];
  [slides[index], slides[j]] = [slides[j]!, slides[index]!];
  return { ...slider, slides };
}

export function removeSlide(slider: SliderData, index: number): SliderData {
  return { ...slider, slides: slider.slides.filter((_, i) => i !== index) };
}

export function insertSlide(slider: SliderData, at: number, slide: Slide): SliderData {
  const slides = [...slider.slides];
  slides.splice(at, 0, slide);
  return { ...slider, slides };
}
