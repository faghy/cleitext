import { addMessages, defineAdminPlugin } from '@cleitext/admin-sdk';
import { AttributesPage, PricingPage } from './admin/attributes';
import { IT } from './admin/it';
import { ProductsPage } from './admin/products';
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
      path: 'pricing',
      title: { en: 'Pricing rules', it: 'Regole di prezzo' },
      icon: 'M6 18L18 6 M7.5 8.5a1 1 0 1 0 0-.01 M16.5 15.5a1 1 0 1 0 0-.01',
      capability,
      component: PricingPage,
    },
  ],
});
