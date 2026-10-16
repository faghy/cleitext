import { addMessages, defineAdminPlugin } from '@cleitext/admin-sdk';
import { AttributesPage, PricingPage } from './admin/attributes';
import { EmailsPage } from './admin/emails';
import { OrdersPage } from './admin/orders';
import { IT } from './admin/it';
import { ProductsPage } from './admin/products';
import { CouponsPage } from './admin/coupons';
import { PaymentsPage } from './admin/payments';
import { ShippingPage } from './admin/shipping';
import { TaxesPage } from './admin/taxes';
import { BrandsPage, CategoriesPage } from './admin/terms';

addMessages('it', IT);

const capability = 'manage_shop';

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Shop', it: 'Negozio' },
      icon: 'M5 8h14l-1.2 12H6.2z M9 8V6a3 3 0 0 1 6 0v2',
      capability,
      component: ProductsPage,
    },
    {
      path: 'orders',
      title: { en: 'Orders', it: 'Ordini' },
      icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
      capability,
      component: OrdersPage,
    },
    {
      path: 'coupons',
      title: { en: 'Coupons', it: 'Coupon' },
      icon: 'M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z M10 7v10',
      capability,
      component: CouponsPage,
    },
    {
      path: 'payments',
      title: { en: 'Payments', it: 'Pagamenti' },
      icon: 'M3 6h18v12H3z M3 10h18 M7 15h3',
      capability,
      component: PaymentsPage,
    },
    {
      path: 'shipping',
      title: { en: 'Shipping', it: 'Spedizioni' },
      icon: 'M3 7h11v9H3z M14 10h4l3 3v3h-7 M7 18.5a1.5 1.5 0 1 0 0-.01 M17 18.5a1.5 1.5 0 1 0 0-.01',
      capability,
      component: ShippingPage,
    },
    {
      path: 'taxes',
      title: { en: 'Taxes', it: 'Imposte' },
      icon: 'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h3',
      capability,
      component: TaxesPage,
    },
    {
      path: 'categories',
      title: { en: 'Shop categories', it: 'Categorie negozio' },
      icon: 'M4 5h6v5H4z M14 14h6v5h-6z M7 10v6.5h7',
      capability,
      component: CategoriesPage,
    },
    {
      path: 'brands',
      title: { en: 'Brands', it: 'Marchi' },
      icon: 'M3 12l9-9h8v8l-9 9z M15.5 8.5h.01',
      capability,
      component: BrandsPage,
    },
    {
      path: 'attributes',
      title: { en: 'Attributes', it: 'Attributi' },
      icon: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M14 5v4 M8 15v4',
      capability,
      component: AttributesPage,
    },
    {
      path: 'emails',
      title: { en: 'Shop emails', it: 'Email del negozio' },
      icon: 'M4 6h16v12H4z M4 7l8 6 8-6',
      capability,
      component: EmailsPage,
    },
    {
      path: 'pricing',
      title: { en: 'Pricing rules', it: 'Regole di prezzo' },
      icon: 'M6 18L18 6 M7.5 8.5a1 1 0 1 0 0-.01 M16.5 15.5a1 1 0 1 0 0-.01',
      capability,
      component: PricingPage,
    },
  ],
});
