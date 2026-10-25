import { z } from 'zod';
import { fieldListSchema, type FieldDefinition, type Label } from './fields.js';

/**
 * Field groups with location rules (plugin API 1.47): a set of fields shown
 * where its rules match, like ACF's. Groups come from the site's owners
 * (stored per site), from plugins and from the theme (`entryFields`); the
 * core evaluates the rules, on the server and live in the admin.
 */

/** What the fields of a group are attached to. */
export type FieldObject = 'entry' | 'term' | 'user' | 'options';

/**
 * Rule parameters, by the object they test:
 * - entries: `contentType` (`*` any), `entry` (id), `template` (the entry's
 *   page template; `default` none), `parent` (parent entry id; `none` at the
 *   top), `term` (a category, tag… term id attached to the entry), `status`;
 * - terms: `taxonomy` (slug, `*` any);
 * - users: `userRole` (the person's role slug, `*` any), `userForm`
 *   (`edit`: an administrator edits the person, `profile`: their own
 *   profile, `all`);
 * - any object: `currentUserRole` (the role of the person editing);
 * - `optionsPage`: reserved for options pages.
 */
export const LOCATION_PARAMS = [
  'contentType',
  'entry',
  'template',
  'parent',
  'term',
  'status',
  'currentUserRole',
  'taxonomy',
  'userRole',
  'userForm',
  'optionsPage',
] as const;
export type LocationParam = (typeof LOCATION_PARAMS)[number];

const PARAM_OBJECT: Record<LocationParam, FieldObject | null> = {
  contentType: 'entry',
  entry: 'entry',
  template: 'entry',
  parent: 'entry',
  term: 'entry',
  status: 'entry',
  currentUserRole: null,
  taxonomy: 'term',
  userRole: 'user',
  userForm: 'user',
  optionsPage: 'options',
};

export interface LocationRule {
  param: LocationParam;
  operator: '==' | '!=';
  value: string;
}

/** Rules: the group shows when every rule of one of the lists matches (an OR of ANDs). */
export type LocationRules = LocationRule[][];

/** What is being edited, for the rules. */
export interface LocationScreen {
  object: FieldObject;
  /** The person editing: their role slug on the site (null without one). */
  currentUserRole?: string | null;
  // Entries
  contentType?: string;
  entryId?: string | null;
  template?: string | null;
  parentId?: string | null;
  /** Ids of the terms attached (all taxonomies). */
  terms?: readonly string[];
  status?: string;
  // Terms
  taxonomy?: string;
  // Users
  userRole?: string | null;
  userForm?: 'edit' | 'profile';
  // Options pages
  optionsPage?: string;
}

export const locationRuleSchema = z.object({
  param: z.enum(LOCATION_PARAMS),
  operator: z.enum(['==', '!=']),
  value: z.string().max(200),
});

export const locationRulesSchema = z
  .array(z.array(locationRuleSchema).min(1).max(20))
  .min(1)
  .max(20);

/** The objects a group's rules can match. */
export function locationObjects(rules: LocationRules): Set<FieldObject> {
  const objects = new Set<FieldObject>();
  for (const and of rules) {
    const own = new Set(and.map((r) => PARAM_OBJECT[r.param]).filter((o) => o !== null));
    // A list with rules of two objects never matches.
    if (own.size === 1) objects.add([...own][0]!);
  }
  return objects;
}

function ruleMatches(rule: LocationRule, screen: LocationScreen): boolean {
  const object = PARAM_OBJECT[rule.param];
  if (object !== null && object !== screen.object) return false;
  const v = rule.value;
  let equal: boolean;
  switch (rule.param) {
    case 'contentType':
      equal = v === '*' || screen.contentType === v;
      break;
    case 'entry':
      equal = !!screen.entryId && screen.entryId === v;
      break;
    case 'template':
      equal = (screen.template || 'default') === (v || 'default');
      break;
    case 'parent':
      equal = (screen.parentId || 'none') === (v || 'none');
      break;
    case 'term':
      equal = (screen.terms ?? []).includes(v);
      break;
    case 'status':
      equal = screen.status === v;
      break;
    case 'currentUserRole':
      equal = (screen.currentUserRole ?? '') === v;
      break;
    case 'taxonomy':
      equal = v === '*' || screen.taxonomy === v;
      break;
    case 'userRole':
      equal = v === '*' || (screen.userRole ?? '') === v;
      break;
    case 'userForm':
      equal = v === 'all' || screen.userForm === v;
      break;
    case 'optionsPage':
      equal = screen.optionsPage === v;
      break;
  }
  return rule.operator === '==' ? equal : !equal;
}

/**
 * Whether rules match what is edited: every rule of one list matches, and
 * that list tests the screen's object (a list with only `currentUserRole`
 * matches nothing).
 */
export function matchesLocation(rules: LocationRules, screen: LocationScreen): boolean {
  return rules.some(
    (and) =>
      and.length > 0 &&
      and.some((r) => PARAM_OBJECT[r.param] === screen.object) &&
      and.every((r) => ruleMatches(r, screen)),
  );
}

/**
 * Whether rules could show a group on entries of a content type, whatever
 * their other rules (template, terms…): for lists of a type's fields.
 */
export function mayMatchType(rules: LocationRules, type: string): boolean {
  return rules.some(
    (and) =>
      and.some((r) => PARAM_OBJECT[r.param] === 'entry') &&
      and.every((r) => PARAM_OBJECT[r.param] === null || PARAM_OBJECT[r.param] === 'entry') &&
      and.every(
        (r) => r.param !== 'contentType' || ruleMatches(r, { object: 'entry', contentType: type }),
      ),
  );
}

/** Rules for the content types of a plugin group (`types`, `'*'` for all). */
export function typesLocation(types: readonly string[]): LocationRules {
  return types.includes('*')
    ? [[{ param: 'contentType', operator: '==', value: '*' }]]
    : types.map((type) => [{ param: 'contentType', operator: '==', value: type }]);
}

/** Where the group's box goes in the entry editor. */
export type FieldGroupPosition = 'side' | 'main';

/** A field group, as plugins and the API define it. */
export interface FieldGroupInput {
  /** Key of the values (`fields[<id>]`), letters, digits, `_` and `-`. */
  id: string;
  title: Label;
  fields: FieldDefinition[];
  location: LocationRules;
  /** `side` (default): the editor's sidebar; `main`: under the content. */
  position?: FieldGroupPosition;
  /** Lower first (default 0), then by title. */
  order?: number;
  /** `top` (default): labels above the fields; `left`: beside them. */
  labelPlacement?: 'top' | 'left';
  /** A few words under the title. */
  description?: Label;
  /** `false`: kept but not shown (default true). */
  active?: boolean;
}

export const FIELD_GROUP_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const label = z.union([z.string().min(1).max(200), z.record(z.string(), z.string().max(200))]);

export const fieldGroupSchema = z.object({
  id: z.string().regex(FIELD_GROUP_ID_RE, 'Lowercase letters, digits, _ and -'),
  title: label,
  fields: z.lazy(() => fieldListSchema),
  location: locationRulesSchema,
  position: z.enum(['side', 'main']).optional(),
  order: z.number().int().min(-1000).max(1000).optional(),
  labelPlacement: z.enum(['top', 'left']).optional(),
  description: label.optional(),
  active: z.boolean().optional(),
});

/** A field group of the site's owners, as the API stores it. */
export const saveFieldGroupRequestSchema = fieldGroupSchema;
export type SaveFieldGroupRequest = z.input<typeof saveFieldGroupRequestSchema>;

/** Where a group comes from. */
export type FieldGroupSource = 'site' | 'theme' | `plugin:${string}`;

/** Groups by order, then title. */
export function sortFieldGroups<T extends { order?: number; title: Label }>(
  groups: readonly T[],
  locale = 'en',
): T[] {
  const text = (l: Label) => (typeof l === 'string' ? l : (l[locale] ?? l.en ?? ''));
  return [...groups].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || text(a.title).localeCompare(text(b.title)),
  );
}
