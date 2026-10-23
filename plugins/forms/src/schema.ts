import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** A field's value in a message with custom fields. */
export interface SubmissionField {
  name: string;
  label: string;
  type: string;
  value: string;
}

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  formName: text('form_name').notNull(),
  pagePath: text('page_path').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  message: text('message').notNull(),
  /** Every field of a custom form, in order (null for the classic form). */
  data: jsonb('data').$type<SubmissionField[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A message as listed by GET /api/v1/ext/forms/submissions. */
export interface Submission {
  id: string;
  formName: string;
  pagePath: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  /** Every field of a custom form, in order (null for the classic form). */
  fields: SubmissionField[] | null;
  createdAt: string;
}
