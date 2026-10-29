/**
 * Stripe on the shop's pages (see `stripe-element.ts`): the Payment Element
 * in the checkout and on the page to pay an order, and the express buttons
 * (Apple Pay, Google Pay, Link) in the checkout, the cart and the product
 * page. Card data is typed in Stripe's frames (stripe.js from js.stripe.com)
 * and never reaches the site. Without scripts, or when Stripe does not load,
 * the checkout works as before: the order goes on to Stripe's page.
 *
 * The script may run more than once (the cart and checkout blocks put their
 * markup in the page, scripts included): it then looks for new places only.
 */

interface StripeError {
  type?: string;
  message?: string;
}
type Handler = (event: Record<string, unknown> & StripeEvent) => void;
interface StripeEvent {
  resolve: (options?: Record<string, unknown>) => void;
  reject: () => void;
  paymentFailed: (options?: Record<string, unknown>) => void;
}
interface StripeElement {
  mount(target: Element): void;
  on(event: string, handler: Handler): void;
}
interface StripeElements {
  create(type: 'payment' | 'expressCheckout', options?: Record<string, unknown>): StripeElement;
  update(options: Record<string, unknown>): void;
  submit(): Promise<{ error?: StripeError }>;
}
interface StripeClient {
  elements(options: Record<string, unknown>): StripeElements;
  confirmPayment(options: Record<string, unknown>): Promise<{ error?: StripeError }>;
}
type StripeFactory = (key: string, options?: Record<string, unknown>) => StripeClient;

interface Texts {
  error: string;
  failed?: string;
  noShipping?: string;
}

const scope = window as unknown as {
  Stripe?: StripeFactory;
  __cleishopStripe?: () => void;
};

const STRIPE_JS = 'https://js.stripe.com/v3/';
let loading: Promise<StripeFactory> | null = null;

/** stripe.js, once per page (Stripe asks to load it from js.stripe.com). */
function loadStripe(): Promise<StripeFactory> {
  if (scope.Stripe) return Promise.resolve(scope.Stripe);
  loading ??= new Promise<StripeFactory>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = STRIPE_JS;
    script.async = true;
    script.onload = () => (scope.Stripe ? resolve(scope.Stripe) : reject(new Error('Stripe')));
    script.onerror = () => {
      loading = null;
      reject(new Error('Stripe'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

const clients = new Map<string, StripeClient>();
async function client(key: string, locale: string): Promise<StripeClient> {
  const factory = await loadStripe();
  const id = `${key}|${locale}`;
  let found = clients.get(id);
  if (!found) {
    found = factory(key, { locale });
    clients.set(id, found);
  }
  return found;
}

async function postJson(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, data };
}

const parse = <T>(value: string | undefined): T | null => {
  try {
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
};

/** Scripts in markup put in the page run as if loaded with it. */
function runScripts(root: Element): void {
  for (const old of root.querySelectorAll('script')) {
    const fresh = document.createElement('script');
    for (const attribute of old.attributes) fresh.setAttribute(attribute.name, attribute.value);
    fresh.text = old.text;
    old.replaceWith(fresh);
  }
}

// ---- The Payment Element -------------------------------------------------------------

interface ElementConfig {
  key: string;
  locale: string;
  currency: string;
  amount: number;
  clientSecret?: string;
  returnUrl?: string;
  texts: Texts;
}

function setupPayment(box: HTMLElement): void {
  const config = parse<ElementConfig>(box.dataset.shopStripe);
  const form = box.closest('form');
  if (!config || !form) return;
  const message = box.querySelector('[data-shop-stripe-error]');
  const show = (text: string) => {
    if (message) message.textContent = text;
  };
  const radios = form.querySelectorAll<HTMLInputElement>('input[name="payment"]');
  // The checkout lists ways to pay; the page to pay an order has only this one.
  const chosen = () =>
    radios.length === 0 ||
    form.querySelector<HTMLInputElement>('input[name="payment"]:checked')?.value === 'stripe';
  // At checkout the order (and its PaymentIntent) comes when the form is sent.
  const deferred = !config.clientSecret;
  let secret = config.clientSecret ?? '';
  let returnUrl = config.returnUrl ?? '';
  let stripe: StripeClient | null = null;
  let elements: StripeElements | null = null;

  client(config.key, config.locale)
    .then((found) => {
      stripe = found;
      elements = found.elements(
        deferred
          ? { mode: 'payment', amount: config.amount, currency: config.currency }
          : { clientSecret: config.clientSecret },
      );
      elements
        .create('payment', { layout: 'tabs' })
        .mount(box.querySelector('.shop-stripe__element')!);
      box.hidden = !chosen();
      for (const radio of radios) radio.addEventListener('change', () => (box.hidden = !chosen()));
    })
    // Stripe did not load: the form goes on to Stripe's page, as without scripts.
    .catch(() => {});

  let busy = false;
  form.addEventListener('submit', (event) => {
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    if (!stripe || !elements || !chosen() || submitter?.name === 'refresh') return;
    event.preventDefault();
    if (busy) return;
    busy = true;
    show('');
    const buttons = form.querySelectorAll<HTMLButtonElement>('button[type="submit"]');
    for (const button of buttons) button.disabled = true;
    const done = () => {
      busy = false;
      for (const button of buttons) button.disabled = false;
    };
    void pay(stripe, elements)
      .catch(() => show(config.texts.error))
      .finally(done);
  });

  async function pay(stripe: StripeClient, elements: StripeElements): Promise<void> {
    if (deferred) {
      const checked = await elements.submit();
      if (checked.error) return show(checked.error.message ?? config!.texts.error);
    }
    if (!secret) {
      // The order: the checkout's fields, as the form would send them.
      const fields = new URLSearchParams();
      for (const [name, value] of new FormData(form!))
        if (typeof value === 'string') fields.append(name, value);
      fields.set('stripeOnPage', '1');
      const response = await fetch(form!.action, {
        method: 'POST',
        body: fields,
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!data) return show(config!.texts.error);
      if (typeof data.redirect === 'string') {
        location.href = data.redirect;
        return;
      }
      // The checkout again (a field to correct, a rate to choose…).
      if (typeof data.html === 'string') return replacePage(form!, data.html);
      if (typeof data.clientSecret !== 'string') return show(config!.texts.error);
      secret = data.clientSecret;
      returnUrl = String(data.returnUrl ?? '');
    }
    const result = await stripe.confirmPayment({
      elements,
      ...(deferred ? { clientSecret: secret } : {}),
      confirmParams: { return_url: returnUrl },
    });
    // Only problems come back: when paid, Stripe sends the customer to the return address.
    if (result.error) show(result.error.message ?? config!.texts.failed ?? config!.texts.error);
  }
}

/** The checkout's markup from the server in place of the page's. */
function replacePage(form: HTMLFormElement, markup: string): void {
  const page = form.closest('.shop-page');
  const holder = document.createElement('div');
  holder.innerHTML = markup;
  const fresh = holder.querySelector('.shop-page');
  if (!page || !fresh) {
    location.reload();
    return;
  }
  page.replaceWith(fresh);
  runScripts(fresh);
  scan();
  fresh.scrollIntoView({ block: 'start' });
}

// ---- The express buttons -------------------------------------------------------------

interface ExpressOptions {
  url: string;
  place: 'checkout' | 'cart' | 'product';
  product?: string;
}
interface Rate {
  id: string;
  displayName: string;
  amount: number;
}
interface ExpressConfig {
  key: string | null;
  locale: string;
  currency: string;
  amount: number;
  needsShipping: boolean;
  phoneRequired: boolean;
  rates: Rate[];
  rate: string | null;
  quoteUrl: string;
  orderUrl: string;
  texts: Texts;
  terms: { url: string; text: string; link: string } | null;
}

async function setupExpress(box: HTMLElement): Promise<void> {
  const options = parse<ExpressOptions>(box.dataset.shopExpress);
  if (!options) return;
  const form = box.closest('form');
  const quantity = () =>
    form?.querySelector<HTMLInputElement>('input[name="quantity"]')?.value || '1';
  // "Buy now": the product of the page, else the visitor's cart.
  const item = () => (options.product ? { product: options.product, quantity: quantity() } : {});
  const configUrl = () => {
    const url = new URL(options.url, location.href);
    url.searchParams.set('place', options.place);
    for (const [name, value] of Object.entries(item())) url.searchParams.set(name, value);
    return url;
  };
  const read = () =>
    fetch(configUrl(), { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? (r.json() as Promise<ExpressConfig>) : null))
      .catch(() => null);
  const config = await read();
  if (!config?.key) return;
  const stripe = await client(config.key, config.locale).catch(() => null);
  if (!stripe) return;
  const message = box.querySelector('[data-shop-express-error]');
  const show = (text: string) => {
    if (message) message.textContent = text;
  };
  const elements = stripe.elements({
    mode: 'payment',
    amount: config.amount,
    currency: config.currency,
  });
  const buttons = elements.create('expressCheckout', {
    buttonType: { applePay: 'buy', googlePay: 'buy' },
  });
  buttons.mount(box.querySelector('.shop-express__buttons')!);
  if (config.terms) {
    const note = document.createElement('p');
    note.className = 'shop-express__terms';
    const [before, after = ''] = config.terms.text.split('{terms}');
    const link = document.createElement('a');
    link.href = config.terms.url;
    link.target = '_blank';
    link.textContent = config.terms.link;
    note.append(before ?? '', link, after);
    box.querySelector('.shop-express__buttons')!.after(note);
  }
  const state = {
    rates: config.rates,
    rate: config.rate,
    address: null as unknown,
  };

  // Shown only when the browser has a wallet (or Link).
  buttons.on('ready', (event) => {
    const methods = (event.availablePaymentMethods ?? {}) as Record<string, unknown>;
    box.hidden = !Object.values(methods).some(Boolean);
  });

  // Another quantity on the product page: another amount.
  form?.querySelector('input[name="quantity"]')?.addEventListener('change', () => {
    void read().then((fresh) => {
      if (!fresh?.key) return;
      state.rates = fresh.rates;
      state.rate = fresh.rate;
      elements.update({ amount: fresh.amount });
    });
  });

  buttons.on('click', (event) => {
    show('');
    event.resolve({
      emailRequired: true,
      phoneNumberRequired: config.phoneRequired,
      billingAddressRequired: true,
      shippingAddressRequired: config.needsShipping,
      ...(config.needsShipping
        ? {
            shippingRates: state.rates.length
              ? state.rates
              : [{ id: 'pending', displayName: '…', amount: 0 }],
          }
        : {}),
    });
  });

  const quote = async (extra: Record<string, unknown>) => {
    const answer = await postJson(config.quoteUrl, { ...item(), ...extra }).catch(() => null);
    return answer?.ok ? (answer.data as unknown as ExpressConfig) : null;
  };

  // The wallet's address (only the city, postcode and country before paying): its rates.
  buttons.on('shippingaddresschange', (event) => {
    state.address = event.address;
    void quote({ address: event.address }).then((found) => {
      if (!found || (config.needsShipping && found.rates.length === 0)) {
        show(config.texts.noShipping ?? '');
        event.reject();
        return;
      }
      state.rates = found.rates;
      state.rate = found.rate;
      elements.update({ amount: found.amount });
      event.resolve({ shippingRates: found.rates });
    });
  });

  buttons.on('shippingratechange', (event) => {
    const rate = (event.shippingRate as Rate).id;
    void quote({ address: state.address, rate }).then((found) => {
      if (!found) {
        event.reject();
        return;
      }
      state.rate = rate;
      elements.update({ amount: found.amount });
      event.resolve();
    });
  });

  // Paying: the order with the wallet's details, then its PaymentIntent confirmed.
  buttons.on('confirm', (event) => {
    void (async () => {
      const checked = await elements.submit();
      if (checked.error) {
        show(checked.error.message ?? config.texts.error);
        return;
      }
      const billing = (event.billingDetails ?? {}) as Record<string, unknown>;
      const placed = await postJson(config.orderUrl, {
        ...item(),
        place: options.place,
        rate: (event.shippingRate as Rate | undefined)?.id ?? state.rate,
        email: billing.email,
        phone: billing.phone,
        billing,
        shipping: event.shippingAddress ?? null,
      }).catch(() => null);
      const data = placed?.data ?? {};
      if (!placed?.ok || typeof data.clientSecret !== 'string') {
        event.paymentFailed({ reason: 'fail' });
        show(typeof data.error === 'string' ? data.error : config.texts.error);
        if (typeof data.redirect === 'string') location.href = data.redirect;
        return;
      }
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: data.clientSecret,
        confirmParams: { return_url: String(data.returnUrl ?? '') },
      });
      if (result.error) show(result.error.message ?? config.texts.error);
    })().catch(() => show(config.texts.error));
  });
}

// ---- Places in the page --------------------------------------------------------------

function scan(): void {
  for (const box of document.querySelectorAll<HTMLElement>('[data-shop-stripe]')) {
    if (box.dataset.shopReady) continue;
    box.dataset.shopReady = '1';
    setupPayment(box);
  }
  for (const box of document.querySelectorAll<HTMLElement>('[data-shop-express]')) {
    if (box.dataset.shopReady) continue;
    box.dataset.shopReady = '1';
    void setupExpress(box);
  }
}

if (scope.__cleishopStripe) scope.__cleishopStripe();
else {
  scope.__cleishopStripe = scan;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
}
