/**
 * Diorama's first screen: the site's sliders, and "New slider" with three
 * doors, as quick as MetaSlider's: your own pictures (choose them, write a
 * title, a text and a button for each, done), a ready-made template, or a
 * blank slider. When the site already has the sliders it may have, the
 * button opens a gentle invitation to Diorama Pro instead, and only then.
 */
import { useT } from '@cleitext/admin-sdk';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultSlide, defaultSlider, normalizeSlider } from '../model/normalize';
import { TEMPLATES, type QuickSlide, type Template } from '../model/templates';
import type { Link, SliderData, SliderRecord, SliderSummary } from '../model/types';
import { SliderView, type RenderMedia } from '../render/render';
import { isLimit, messageOf, sliderApi, type Overview } from './api';
import { LinkEditor } from './fields';
import { MediaDialog, refOf, thumbOf, type MediaItem } from './media';
import { proAdmin } from './pro';
import { Btn, Dialog, Field, ICON, Svg, useToast } from './ui';

const NO_MEDIA = new Map<string, RenderMedia>();

/** A template drawn small, as the page would show its first slide. */
export function TemplateThumb({ template, locale }: { template: Template; locale: string }) {
  const slider = useMemo(() => normalizeSlider(template.build()), [template]);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.24);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setScale(el.clientWidth / 1200));
    observer.observe(el);
    setScale(el.clientWidth / 1200);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={box}
      aria-hidden="true"
      style={{ width: '100%', aspectRatio: '2 / 1', overflow: 'hidden', pointerEvents: 'none' }}
    >
      <div style={{ width: 1200, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <SliderView
          slider={{ ...slider, layout: 'auto', size: { base: { height: 600, offset: 0 } } }}
          scope={`t${template.id.replace(/[^a-z0-9]/g, '')}`}
          uid={`dio-t-${template.id}`}
          title={template.name}
          locale={locale}
          media={NO_MEDIA}
          mode="canvas"
          device="desktop"
          withBaseCss
        />
      </div>
    </div>
  );
}

function Door({
  icon,
  title,
  text,
  onClick,
  testId,
}: {
  icon: string;
  title: string;
  text: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="dst-card"
      onClick={onClick}
      data-testid={testId}
      style={{ padding: 18 }}
    >
      <span
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          width: 42,
          height: 42,
          borderRadius: 10,
          background: '#eef2ff',
          color: '#4f46e5',
          marginBottom: 10,
        }}
      >
        <Svg path={icon} size={22} />
      </span>
      <strong style={{ display: 'block', fontSize: 15, marginBottom: 4 }}>{title}</strong>
      <span className="dst-help" style={{ fontSize: 13 }}>
        {text}
      </span>
    </button>
  );
}

/** The first steps of a new slider. */
function StartDialog({
  locale,
  onClose,
  onCreate,
}: {
  locale: string;
  onClose: () => void;
  onCreate: (input: {
    title?: string;
    template?: string;
    quick?: QuickSlide[];
    blank?: boolean;
    data?: SliderData;
  }) => Promise<void>;
}) {
  const { t } = useT();
  const [step, setStep] = useState<'doors' | 'pictures' | 'words' | 'templates'>('doors');
  const [pictures, setPictures] = useState<MediaItem[]>([]);
  const [words, setWords] = useState<{ title: string; text: string; button: string; link: Link }[]>(
    [],
  );
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const templates = [...TEMPLATES, ...proAdmin().templates];

  const create = async (input: Parameters<typeof onCreate>[0]) => {
    setBusy(true);
    try {
      await onCreate(input);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'pictures')
    return (
      <MediaDialog
        title={t('Choose the pictures of the slides')}
        multiple
        onClose={() => setStep('doors')}
        onChoose={(items) => {
          setPictures(items);
          setWords(
            items.map(() => ({
              title: '',
              text: '',
              button: '',
              link: { kind: 'none', value: '' },
            })),
          );
          setStep('words');
        }}
      />
    );

  if (step === 'words')
    return (
      <Dialog
        title={t('Words on the slides (all optional)')}
        onClose={onClose}
        footer={
          <>
            <Btn onClick={() => setStep('pictures')}>{t('Back')}</Btn>
            <Btn
              kind="primary"
              disabled={busy}
              data-testid="dio-quick-create"
              onClick={() =>
                void create({
                  title: name || t('Slider'),
                  quick: pictures.map((p, i) => ({
                    image: refOf(p),
                    title: words[i]!.title.trim(),
                    text: words[i]!.text.trim(),
                    button: words[i]!.button.trim(),
                    link: words[i]!.link,
                  })),
                })
              }
            >
              {busy ? t('Creating…') : t('Create the slider')}
            </Btn>
          </>
        }
      >
        <Field label={t('Name of the slider')} help={t('Only you see it, in the admin.')}>
          <input
            className="dst-input"
            value={name}
            placeholder={t('Home page slider')}
            onChange={(e) => setName(e.target.value)}
            data-autofocus=""
            data-testid="dio-quick-name"
          />
        </Field>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
          {pictures.map((picture, i) => (
            <li
              key={picture.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '180px 1fr',
                gap: 16,
                padding: 12,
                border: '1px solid #e2e8f0',
                borderRadius: 12,
              }}
            >
              <img
                src={thumbOf(picture, 300)}
                alt=""
                style={{ width: 180, height: 120, objectFit: 'cover', borderRadius: 8 }}
              />
              <div>
                <div className="dst-grid2">
                  <Field label={t('Title')}>
                    <input
                      className="dst-input"
                      value={words[i]!.title}
                      data-testid="dio-quick-title"
                      onChange={(e) =>
                        setWords((w) =>
                          w.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                        )
                      }
                    />
                  </Field>
                  <Field label={t('Button text')}>
                    <input
                      className="dst-input"
                      value={words[i]!.button}
                      placeholder={t('e.g. Book now')}
                      onChange={(e) =>
                        setWords((w) =>
                          w.map((x, j) => (j === i ? { ...x, button: e.target.value } : x)),
                        )
                      }
                    />
                  </Field>
                </div>
                <Field label={t('Text')}>
                  <input
                    className="dst-input"
                    value={words[i]!.text}
                    onChange={(e) =>
                      setWords((w) =>
                        w.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                      )
                    }
                  />
                </Field>
                {words[i]!.button.trim() && (
                  <LinkEditor
                    label={t('The button leads to')}
                    value={words[i]!.link}
                    posts={false}
                    onChange={(link) =>
                      setWords((w) => w.map((x, j) => (j === i ? { ...x, link } : x)))
                    }
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      </Dialog>
    );

  if (step === 'templates')
    return (
      <Dialog
        title={t('Start from a template')}
        size="wide"
        onClose={onClose}
        footer={<Btn onClick={() => setStep('doors')}>{t('Back')}</Btn>}
      >
        <p className="dst-help" style={{ marginTop: 0 }}>
          {t('Templates use colours and shapes only: put your own pictures in them afterwards.')}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: 14,
          }}
        >
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="dst-card"
              disabled={busy}
              onClick={() =>
                void create(
                  TEMPLATES.includes(template)
                    ? { template: template.id, title: t(template.name) }
                    : // An extension's template (Diorama 1.1): the server knows only Diorama's own.
                      { data: normalizeSlider(template.build()), title: t(template.name) },
                )
              }
              data-testid={`dio-template-${template.id}`}
            >
              <TemplateThumb template={template} locale={locale} />
              <span style={{ display: 'block', padding: '10px 12px' }}>
                <strong style={{ display: 'block' }}>{t(template.name)}</strong>
                <span className="dst-help">{t(template.description)}</span>
              </span>
            </button>
          ))}
        </div>
      </Dialog>
    );

  return (
    <Dialog title={t('New slider')} onClose={onClose}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <Door
          icon={ICON.image}
          title={t('From your pictures')}
          text={t(
            'Choose a few pictures, write a title and a button if you like: done in a minute.',
          )}
          onClick={() => setStep('pictures')}
          testId="dio-door-pictures"
        />
        <Door
          icon={ICON.sliders}
          title={t('From a template')}
          text={t('Ten ready-made designs: a hero, a restaurant, a sale, testimonials, an event…')}
          onClick={() => setStep('templates')}
          testId="dio-door-template"
        />
        <Door
          icon={ICON.plus}
          title={t('Blank')}
          text={t('An empty slide to build layer by layer.')}
          onClick={() => void create({ blank: true, title: t('Slider') })}
          testId="dio-door-blank"
        />
      </div>
    </Dialog>
  );
}

/** Said once, when a second slider is asked for: what the free version keeps, and Pro. */
function ProDialog({
  overview,
  onClose,
  onOpen,
}: {
  overview: Overview;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useT();
  const custom = proAdmin().invitation;
  const first = overview.sliders[0];
  return (
    <Dialog
      title={custom?.title ?? t('One slider is included')}
      size="small"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>{t('Not now')}</Btn>
          {first && (
            <Btn onClick={() => onOpen(first.id)} icon={ICON.edit}>
              {t('Open “{title}”', { title: first.title })}
            </Btn>
          )}
          <a
            className="dst-btn dst-btn--primary"
            href={custom?.url ?? overview.upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {custom?.action ?? t('Discover Diorama Pro')}
          </a>
        </>
      }
    >
      <div data-testid="dio-pro-invitation">
        <p style={{ marginTop: 0 }}>
          {custom?.text ??
            t(
              'The free version of Diorama keeps one slider per site, with as many slides as you like, every effect and every template.',
            )}
        </p>
        <p>
          {t(
            'You can change your slider at any time: add slides, start again from a template, or turn it into a hero. With Diorama Pro you get as many sliders as you need, plus carousels, popups and more effects.',
          )}
        </p>
        <p className="dst-help" style={{ marginBottom: 0 }}>
          {t('Nothing stops working: the slider you have stays on your pages.')}
        </p>
      </div>
    </Dialog>
  );
}

export function SlidersList({
  overview,
  locale,
  onOpen,
  onCreated,
  onChanged,
}: {
  overview: Overview;
  locale: string;
  onOpen: (id: string) => void;
  onCreated: (record: SliderRecord) => void;
  onChanged: () => void;
}) {
  const { t, language } = useT();
  const [dialog, setDialog] = useState<'start' | 'pro' | null>(null);
  const [toast, notify] = useToast();

  const create = async (input: {
    title?: string;
    template?: string;
    quick?: QuickSlide[];
    blank?: boolean;
    data?: SliderData;
  }) => {
    try {
      const record = await sliderApi.create(
        input.blank
          ? {
              title: input.title ?? t('Slider'),
              data: normalizeSlider(defaultSlider({ slides: [defaultSlide()] })),
            }
          : input,
      );
      setDialog(null);
      onCreated(record);
    } catch (error) {
      if (isLimit(error)) setDialog('pro');
      else notify(messageOf(error), 'error');
    }
  };

  const remove = async (slider: SliderSummary) => {
    if (
      !window.confirm(
        t('Delete “{title}”? Pages showing it will show nothing in its place.', {
          title: slider.title,
        }),
      )
    )
      return;
    try {
      await sliderApi.remove(slider.id);
      onChanged();
      notify(t('Deleted'));
    } catch (error) {
      notify(messageOf(error), 'error');
    }
  };

  const duplicate = async (slider: SliderSummary) => {
    try {
      const record = await sliderApi.duplicate(slider.id);
      onChanged();
      onOpen(record.id);
    } catch (error) {
      if (isLimit(error)) setDialog('pro');
      else notify(messageOf(error), 'error');
    }
  };

  const extra = proAdmin()
    .canCreate.map((fn) => fn(overview.count))
    .find((v) => v !== undefined);
  const canCreate = extra ?? overview.canCreate;

  const when = (iso: string) =>
    new Date(iso).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });

  let body: ReactNode;
  if (overview.sliders.length === 0) {
    body = (
      <div className="dst-empty" style={{ background: '#fff' }}>
        <div
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            width: 56,
            height: 56,
            borderRadius: 14,
            background: '#eef2ff',
            color: '#4f46e5',
            marginBottom: 12,
          }}
        >
          <Svg path={ICON.sliders} size={28} />
        </div>
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>{t('Your first slider')}</h2>
        <p style={{ margin: '0 0 16px' }}>
          {t('Start from your pictures or from a template: you can change everything later.')}
        </p>
        <Btn
          kind="primary"
          icon={ICON.plus}
          onClick={() => setDialog('start')}
          data-testid="dio-new"
        >
          {t('New slider')}
        </Btn>
      </div>
    );
  } else {
    body = (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        {overview.sliders.map((slider) => (
          <div
            key={slider.id}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            <button
              type="button"
              className="dst-card"
              style={{ border: 0, borderRadius: 0 }}
              onClick={() => onOpen(slider.id)}
              aria-label={t('Edit “{title}”', { title: slider.title })}
              data-testid="dio-open"
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'block',
                  height: 150,
                  background: slider.thumbnail
                    ? `center/cover no-repeat url("${slider.thumbnail.url.replace(/"/g, '%22')}")`
                    : slider.cover,
                }}
              />
            </button>
            <div style={{ padding: 12 }}>
              <div className="dst-row" style={{ justifyContent: 'space-between' }}>
                <strong>{slider.title}</strong>
                <span className="dst-pill">
                  {slider.type === 'hero' ? t('Hero') : t('{n} slides', { n: slider.slides })}
                </span>
              </div>
              <p className="dst-help" style={{ margin: '4px 0 10px' }}>
                <code>[diorama alias="{slider.alias}"]</code> ·{' '}
                {t('Changed {date}', { date: when(slider.updatedAt) })}
              </p>
              <div className="dst-row" style={{ gap: 6 }}>
                <Btn small kind="primary" icon={ICON.edit} onClick={() => onOpen(slider.id)}>
                  {t('Edit')}
                </Btn>
                <Btn small icon={ICON.copy} onClick={() => void duplicate(slider)}>
                  {t('Duplicate')}
                </Btn>
                <Btn small kind="danger" icon={ICON.trash} onClick={() => void remove(slider)}>
                  {t('Delete')}
                </Btn>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dst" style={{ display: 'grid', gap: 18 }}>
      <div className="dst-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24 }}>Diorama</h1>
          <p className="dst-help" style={{ margin: '2px 0 0', fontSize: 14 }}>
            {t('Sliders and hero sections, quick to make and light on your pages.')}
          </p>
        </div>
        {overview.sliders.length > 0 && (
          <Btn
            kind="primary"
            icon={ICON.plus}
            onClick={() => setDialog(canCreate ? 'start' : 'pro')}
            data-testid="dio-new"
          >
            {t('New slider')}
          </Btn>
        )}
      </div>
      {body}
      <p className="dst-help">
        {t(
          'Show a slider with the “Slider (Diorama)” block in the block editor, the Slider widget in Fresco, or its shortcode alone in a paragraph.',
        )}
      </p>
      {dialog === 'start' && (
        <StartDialog locale={locale} onClose={() => setDialog(null)} onCreate={create} />
      )}
      {dialog === 'pro' && (
        <ProDialog
          overview={overview}
          onClose={() => setDialog(null)}
          onOpen={(id) => (setDialog(null), onOpen(id))}
        />
      )}
      {toast}
    </div>
  );
}
