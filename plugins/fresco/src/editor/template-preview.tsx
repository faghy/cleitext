/**
 * The preview of a saved template (Templates in the editor and in Fresco's
 * menu): its elements drawn in a frame of their own with Fresco's styles,
 * the site's kit and their CSS, at the width of a desktop, a tablet or a phone.
 */
import { t } from '@cleitext/admin-sdk';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { documentCss, withDefaults } from '../core/css.js';
import { kitCss, type Kit } from '../core/kit.js';
import type { FrescoNode, RenderContext } from '../core/model.js';
import { getElement } from '../core/registry.js';

/** `/plugin-assets/fresco/<version>`, from the address of Fresco's admin script. */
export function frescoAssetsBase(): string {
  try {
    const version = /\/fresco\/([^/]+)\/[^/]*$/.exec(new URL(import.meta.url).pathname)?.[1];
    return version ? `/plugin-assets/fresco/${version}` : '/plugin-assets/fresco/current';
  } catch {
    return '/plugin-assets/fresco/current';
  }
}

const WIDTHS = { desktop: null, tablet: 768, mobile: 390 } as const;
type Width = keyof typeof WIDTHS;

const CSS = `
.fre-preview{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55);font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
.fre-preview__box{display:flex;flex-direction:column;width:min(1200px,94vw);height:min(820px,90vh);border-radius:10px;background:#f1f3f5;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
.fre-preview__head{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border-bottom:1px solid #e5e7eb;color:#1f2937}
.fre-preview__head strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-preview__head button{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#1f2937;font:inherit;font-size:13px;cursor:pointer}
.fre-preview__head button.is-on{border-color:#c2410c;color:#c2410c}
.fre-preview__head .fre-preview__insert{background:#c2410c;border-color:#c2410c;color:#fff}
.fre-preview__stage{flex:1;min-height:0;display:flex;justify-content:center;overflow:auto;padding:16px}
.fre-preview__stage iframe{flex:0 0 auto;width:100%;height:100%;border:0;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.08)}
`;

/** An element as the page shows it (nothing of the editor's). */
function renderOne(node: FrescoNode, context: RenderContext): ReactNode {
  const definition = getElement(node.type);
  if (!definition) return null;
  const children = node.children?.map((child) => (
    <Fragment key={child.id}>{renderOne(child, context)}</Fragment>
  ));
  try {
    return definition.render({
      node,
      settings: withDefaults(definition, node.attrs),
      ...(children ? { children, items: children } : {}),
      context,
    });
  } catch {
    return null;
  }
}

export function TemplatePreview({
  title,
  blocks,
  kit,
  locale = 'en',
  onClose,
  onInsert,
}: {
  title: string;
  blocks: FrescoNode[];
  kit: Kit;
  locale?: string;
  onClose: () => void;
  /** Shown in the editor: inserts the template and closes. */
  onInsert?: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState<Width>('desktop');
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const css = documentCss(blocks, getElement, kit.breakpoints);
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${frescoAssetsBase()}/fresco.css"><style>body{margin:0;font-family:system-ui,sans-serif}</style></head><body></body></html>`;
  const context: RenderContext = {
    media: new Map(),
    locale,
    editing: false,
    site: { title: '', tagline: '', home: '/' },
  };
  const devices: { id: Width; label: string }[] = [
    { id: 'desktop', label: t('Desktop') },
    { id: 'tablet', label: t('Tablet') },
    { id: 'mobile', label: t('Mobile') },
  ];
  return (
    <div
      className="fre-preview"
      role="dialog"
      aria-modal="true"
      aria-label={t('Preview of “{name}”', { name: title })}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <style>{CSS}</style>
      <div className="fre-preview__box">
        <div className="fre-preview__head">
          <strong>{title}</strong>
          {devices.map((device) => (
            <button
              key={device.id}
              type="button"
              className={width === device.id ? 'is-on' : ''}
              aria-pressed={width === device.id}
              onClick={() => setWidth(device.id)}
            >
              {device.label}
            </button>
          ))}
          {onInsert && (
            <button type="button" className="fre-preview__insert" onClick={onInsert}>
              {t('Insert')}
            </button>
          )}
          <button type="button" aria-label={t('Close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fre-preview__stage">
          <iframe
            ref={frame}
            title={t('Preview of “{name}”', { name: title })}
            srcDoc={html}
            style={WIDTHS[width] ? { width: `${WIDTHS[width]}px` } : undefined}
            onLoad={() => setBody(frame.current?.contentDocument?.body ?? null)}
          />
        </div>
      </div>
      {body &&
        createPortal(
          <>
            <style>{kitCss(kit)}</style>
            <style>{css}</style>
            <div className="fre-preview__page">
              {blocks.map((node) => (
                <Fragment key={node.id}>{renderOne(node, context)}</Fragment>
              ))}
            </div>
          </>,
          body,
        )}
    </div>
  );
}
