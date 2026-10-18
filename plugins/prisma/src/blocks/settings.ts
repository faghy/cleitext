import type { Inspector } from '../editor/register';
import { BlockquoteSettings } from './blockquote/settings.gutenberg';
import { ButtonSettings, ButtonsSettings } from './buttons/settings.gutenberg';
import { CallToActionSettings } from './call-to-action/settings.gutenberg';
import { ContainerSettings } from './container/settings.gutenberg';
import {
  ContentTimelineItemSettings,
  ContentTimelineSettings,
} from './content-timeline/settings.gutenberg';
import { CountdownSettings } from './countdown/settings.gutenberg';
import { CounterSettings } from './counter/settings.gutenberg';
import { FaqItemSettings, FaqSettings } from './faq/settings.gutenberg';
import { FORM_SETTINGS_BY_NAME, FormSettings } from './form/settings.gutenberg';
import { GallerySettings } from './gallery/settings.gutenberg';
import { GoogleMapSettings } from './google-map/settings.gutenberg';
import { HeadingSettings } from './heading/settings.gutenberg';
import { HowToSettings, HowToStepSettings } from './how-to/settings.gutenberg';
import { IconSettings } from './icon/settings.gutenberg';
import { IconListItemSettings, IconListSettings } from './icon-list/settings.gutenberg';
import { ImageSettings } from './image/settings.gutenberg';
import { InfoBoxSettings } from './info-box/settings.gutenberg';
import { InlineNoticeSettings } from './inline-notice/settings.gutenberg';
import { LottieSettings } from './lottie/settings.gutenberg';
import { MarketingButtonSettings } from './marketing-button/settings.gutenberg';
import { ModalSettings } from './modal/settings.gutenberg';
import { PostCarouselSettings } from './post-carousel/settings.gutenberg';
import { PostGridSettings } from './post-grid/settings.gutenberg';
import { PostTimelineSettings } from './post-timeline/settings.gutenberg';
import {
  RestaurantMenuItemSettings,
  RestaurantMenuSettings,
} from './restaurant-menu/settings.gutenberg';
import { ReviewSettings } from './review/settings.gutenberg';
import { SeparatorSettings } from './separator/settings.gutenberg';
import { SlideSettings, SliderSettings } from './slider/settings.gutenberg';
import { SocialShareItemSettings, SocialShareSettings } from './social-share/settings.gutenberg';
import { StarRatingSettings } from './star-rating/settings.gutenberg';
import { TableOfContentsSettings } from './table-of-contents/settings.gutenberg';
import { TabSettings, TabsSettings } from './tabs/settings.gutenberg';
import { TaxonomyListSettings } from './taxonomy-list/settings.gutenberg';
import { TeamSettings } from './team/settings.gutenberg';
import { TestimonialSettings } from './testimonial/settings.gutenberg';

/** The sidebar settings of each block, by name (editor only). */
export const SETTINGS: Record<string, Inspector> = {
  blockquote: BlockquoteSettings,
  buttons: ButtonsSettings,
  button: ButtonSettings,
  'call-to-action': CallToActionSettings,
  container: ContainerSettings,
  'content-timeline': ContentTimelineSettings,
  'content-timeline-item': ContentTimelineItemSettings,
  countdown: CountdownSettings,
  counter: CounterSettings,
  faq: FaqSettings,
  'faq-item': FaqItemSettings,
  form: FormSettings,
  ...FORM_SETTINGS_BY_NAME,
  gallery: GallerySettings,
  'google-map': GoogleMapSettings,
  heading: HeadingSettings,
  'how-to': HowToSettings,
  'how-to-step': HowToStepSettings,
  icon: IconSettings,
  'icon-list': IconListSettings,
  'icon-list-item': IconListItemSettings,
  image: ImageSettings,
  'info-box': InfoBoxSettings,
  'inline-notice': InlineNoticeSettings,
  lottie: LottieSettings,
  'marketing-button': MarketingButtonSettings,
  modal: ModalSettings,
  'post-carousel': PostCarouselSettings,
  'post-grid': PostGridSettings,
  'post-timeline': PostTimelineSettings,
  'restaurant-menu': RestaurantMenuSettings,
  'restaurant-menu-item': RestaurantMenuItemSettings,
  review: ReviewSettings,
  separator: SeparatorSettings,
  slider: SliderSettings,
  slide: SlideSettings,
  'social-share': SocialShareSettings,
  'social-share-item': SocialShareItemSettings,
  'star-rating': StarRatingSettings,
  'table-of-contents': TableOfContentsSettings,
  tabs: TabsSettings,
  tab: TabSettings,
  'taxonomy-list': TaxonomyListSettings,
  team: TeamSettings,
  testimonial: TestimonialSettings,
};
