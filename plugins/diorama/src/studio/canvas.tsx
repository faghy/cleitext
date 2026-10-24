/**
 * The slide on the canvas: drawn by the same code as the page, for one
 * device, scaled to fit. A click selects a layer (or its box), a drag moves
 * the layer on the slide (snapping to the centre), handles change its width
 * and height. Positions are percentages of the slide, so they hold on every
 * screen of that device.
 */
import { useT } from '@cleitext/admin-sdk';
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { DESIGN_WIDTH } from '../model/presets';
import { layerPos } from '../model/resolve';
import type { Device, LayerPos, SliderData } from '../model/types';
import { SliderView, type RenderMedia } from '../render/render';
import { findLayer } from './ops';

const NO_MEDIA = new Map<string, RenderMedia>();
const SNAP = 1.2;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Canvas({
  slider,
  title,
  slideIndex,
  device,
  selected,
  locale,
  motion,
  onSelect,
  onMove,
  onCommit,
  onEditText,
}: {
  slider: SliderData;
  title: string;
  slideIndex: number;
  device: Device;
  selected: string | null;
  locale: string;
  motion: number;
  onSelect: (id: string | null) => void;
  /** A live change of a layer's position on this device. */
  onMove: (id: string, patch: Partial<LayerPos>) => void;
  /** The end of a drag: one undo step. */
  onCommit: () => void;
  onEditText: (id: string) => void;
}) {
  const { t } = useT();
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(900);
  const [height, setHeight] = useState(500);
  const [box, setBox] = useState<Box | null>(null);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [playing, setPlaying] = useState(false);
  const width = DESIGN_WIDTH[device];
  const scale = Math.min(1, Math.max(0.2, (available - 48) / width));
  const slide = slider.slides[slideIndex];

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setAvailable(el.clientWidth));
    observer.observe(el);
    setAvailable(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Entrance effects play for a moment when asked ("Play").
  useLayoutEffect(() => {
    if (!motion) return;
    setPlaying(true);
    const timer = window.setTimeout(() => setPlaying(false), 3500);
    return () => window.clearTimeout(timer);
  }, [motion]);

  // The selection's frame follows the layer (and the slide's height).
  useLayoutEffect(() => {
    const root = inner.current;
    if (!root) return;
    const stage = root.querySelector<HTMLElement>('.dio');
    if (stage) setHeight(stage.offsetHeight);
    const el = selected ? root.querySelector<HTMLElement>(`[data-dio-layer="${selected}"]`) : null;
    const parent = outer.current?.querySelector<HTMLElement>('.dst-stage');
    if (!el || !parent) {
      setBox(null);
      return;
    }
    const a = el.getBoundingClientRect();
    const b = parent.getBoundingClientRect();
    const next = { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
    setBox((prev) =>
      prev &&
      Math.abs(prev.x - next.x) < 0.5 &&
      Math.abs(prev.y - next.y) < 0.5 &&
      Math.abs(prev.w - next.w) < 0.5 &&
      Math.abs(prev.h - next.h) < 0.5
        ? prev
        : next,
    );
  });

  const slideRect = () =>
    inner.current?.querySelector<HTMLElement>('.dio__slide')?.getBoundingClientRect() ?? null;

  const startDrag = (e: ReactPointerEvent, id: string, mode: 'move' | 'e' | 'w' | 's' | 'se') => {
    const found = findLayer(slide, id);
    const rect = slideRect();
    if (!found || found.parent || !rect) return;
    e.preventDefault();
    e.stopPropagation();
    const start = layerPos(found.layer, device, slider.autoMobile);
    const el = inner.current?.querySelector<HTMLElement>(`[data-dio-layer="${id}"]`);
    const own = el?.getBoundingClientRect();
    const startW = start.w || (own ? (own.width / rect.width) * 100 : 20);
    const startH = start.h || (own ? (own.height / rect.height) * 100 : 20);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    const round = (n: number) => Math.round(n * 10) / 10;
    const onMoveEvent = (ev: PointerEvent) => {
      const dx = ((ev.clientX - x0) / rect.width) * 100;
      const dy = ((ev.clientY - y0) / rect.height) * 100;
      if (!moved && Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - y0) < 3) return;
      moved = true;
      if (mode === 'move') {
        let x = round(start.x + dx);
        let y = round(start.y + dy);
        const snapX = Math.abs(x - 50) < SNAP && ['t', 'c', 'b'].includes(start.anchor);
        const snapY = Math.abs(y - 50) < SNAP && ['l', 'c', 'r'].includes(start.anchor);
        if (snapX) x = 50;
        if (snapY) y = 50;
        setGuides({ x: snapX, y: snapY });
        onMove(id, { x, y });
      } else {
        const horizontal = start.anchor.endsWith('r')
          ? 'r'
          : start.anchor.endsWith('l')
            ? 'l'
            : 'c';
        const factor = horizontal === 'c' ? 2 : 1;
        const patch: Partial<LayerPos> = {};
        if (mode === 'e' || mode === 'se')
          patch.w = round(Math.min(100, Math.max(2, startW + dx * factor)));
        if (mode === 'w') patch.w = round(Math.min(100, Math.max(2, startW - dx * factor)));
        if (mode === 's' || mode === 'se') {
          const vertical = start.anchor.startsWith('b')
            ? 'b'
            : start.anchor.startsWith('t')
              ? 't'
              : 'c';
          patch.h = round(Math.min(100, Math.max(1, startH + dy * (vertical === 'c' ? 2 : 1))));
        }
        onMove(id, patch);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMoveEvent);
      window.removeEventListener('pointerup', onUp);
      setGuides({ x: false, y: false });
      if (moved) onCommit();
    };
    window.addEventListener('pointermove', onMoveEvent);
    window.addEventListener('pointerup', onUp);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const hit = target.closest<HTMLElement>('[data-dio-layer]');
    if (!hit) {
      onSelect(null);
      return;
    }
    const id = hit.getAttribute('data-dio-layer')!;
    onSelect(id);
    // Layers of a box move with their box.
    const top = target.closest<HTMLElement>('.dio__layers > [data-dio-layer]');
    if (top) startDrag(e, top.getAttribute('data-dio-layer')!, 'move');
  };

  const selectedLayer = findLayer(slide, selected);
  const resizable = selectedLayer && !selectedLayer.parent;
  const tall =
    selectedLayer &&
    ['image', 'shape', 'box'].includes(selectedLayer.layer.type) &&
    selectedLayer.layer.type !== 'box';
  const anchor = selectedLayer
    ? layerPos(selectedLayer.layer, device, slider.autoMobile).anchor
    : 'tl';
  const handle = (mode: 'e' | 'w' | 's' | 'se', style: CSSProperties) => (
    <span
      key={mode}
      data-dio-handle={mode}
      onPointerDown={(e) => selected && startDrag(e, selected, mode)}
      style={{
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: 3,
        background: '#fff',
        border: '2px solid #4f46e5',
        pointerEvents: 'auto',
        cursor: mode === 's' ? 'ns-resize' : mode === 'se' ? 'nwse-resize' : 'ew-resize',
        ...style,
      }}
    />
  );

  return (
    <div
      ref={outer}
      className="dst-canvas"
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'auto',
        padding: 24,
        background: 'repeating-conic-gradient(#e2e8f0 0 25%, #f1f5f9 0 50%) 0 0/20px 20px',
      }}
    >
      {!slide ? (
        <div className="dst-empty" style={{ background: '#fff' }}>
          {t('This slider has no slides yet. Add one on the left.')}
        </div>
      ) : (
        <div
          className="dst-stage"
          style={{
            position: 'relative',
            width: width * scale,
            height: height * scale,
            margin: '0 auto',
            boxShadow: '0 10px 30px rgba(15,23,42,.18)',
            background: '#fff',
          }}
        >
          <div
            ref={inner}
            data-testid="dio-canvas"
            onPointerDown={onPointerDown}
            onDoubleClick={(e) => {
              const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-dio-layer]');
              if (hit) onEditText(hit.getAttribute('data-dio-layer')!);
            }}
            style={{
              width,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            <SliderView
              slider={slider}
              scope="edit"
              uid="dio-edit"
              title={title}
              locale={locale}
              media={NO_MEDIA}
              mode="canvas"
              device={device}
              slideIndex={slideIndex}
              withBaseCss
              motion={playing}
              key={playing ? `play-${motion}` : 'still'}
            />
          </div>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {guides.x && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: '50%',
                  borderLeft: '1px dashed #ec4899',
                }}
              />
            )}
            {guides.y && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '50%',
                  borderTop: '1px dashed #ec4899',
                }}
              />
            )}
            {box && (
              <div
                data-testid="dio-selection"
                style={{
                  position: 'absolute',
                  left: box.x - 2,
                  top: box.y - 2,
                  width: box.w + 4,
                  height: box.h + 4,
                  border: `2px solid ${selectedLayer?.parent ? '#a855f7' : '#4f46e5'}`,
                  borderRadius: 3,
                }}
              >
                {resizable &&
                  (anchor.endsWith('r')
                    ? handle('w', { left: -7, top: '50%', marginTop: -6 })
                    : handle('e', { right: -7, top: '50%', marginTop: -6 }))}
                {resizable && tall && handle('s', { bottom: -7, left: '50%', marginLeft: -6 })}
                {resizable &&
                  tall &&
                  !anchor.endsWith('r') &&
                  handle('se', { right: -7, bottom: -7 })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
