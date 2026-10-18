import type { PrismaBlock } from '../lib/types';
import { blockquote } from './blockquote';
import { button, buttons } from './buttons';
import { callToAction } from './call-to-action';
import { container } from './container';
import { contentTimeline, contentTimelineItem } from './content-timeline';
import { countdown } from './countdown';
import { counter } from './counter';
import { faq, faqItem } from './faq';
import { form } from './form';
import { FORM_FIELDS } from './form/fields';
import { gallery } from './gallery';
import { googleMap } from './google-map';
import { heading } from './heading';
import { howTo, howToStep } from './how-to';
import { icon } from './icon';
import { iconList, iconListItem } from './icon-list';
import { image } from './image';
import { infoBox } from './info-box';
import { inlineNotice } from './inline-notice';
import { lottie } from './lottie';
import { marketingButton } from './marketing-button';
import { modal } from './modal';
import { postCarousel } from './post-carousel';
import { postGrid } from './post-grid';
import { postTimeline } from './post-timeline';
import { restaurantMenu, restaurantMenuItem } from './restaurant-menu';
import { review } from './review';
import { separator } from './separator';
import { slide, slider } from './slider';
import { socialShare, socialShareItem } from './social-share';
import { starRating } from './star-rating';
import { tableOfContents } from './table-of-contents';
import { tab, tabs } from './tabs';
import { taxonomyList } from './taxonomy-list';
import { team } from './team';
import { testimonial } from './testimonial';

/** Every Prisma block, in the inserter's order. */
export const BLOCKS: PrismaBlock[] = [
  // Layout and basics.
  container,
  heading,
  image,
  gallery,
  infoBox,
  buttons,
  button,
  icon,
  iconList,
  iconListItem,
  separator,
  // Content.
  callToAction,
  marketingButton,
  blockquote,
  counter,
  countdown,
  starRating,
  inlineNotice,
  tabs,
  tab,
  faq,
  faqItem,
  modal,
  slider,
  slide,
  contentTimeline,
  contentTimelineItem,
  tableOfContents,
  testimonial,
  team,
  socialShare,
  socialShareItem,
  restaurantMenu,
  restaurantMenuItem,
  review,
  howTo,
  howToStep,
  googleMap,
  lottie,
  // Posts.
  postGrid,
  postCarousel,
  postTimeline,
  taxonomyList,
  // Forms.
  form,
  ...FORM_FIELDS,
];
