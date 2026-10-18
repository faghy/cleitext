import { expect, it } from 'vitest';
import { heading } from '../src/blocks/heading';
import { renderBlock, text } from './render';

it('draws a heading with its description and CSS (example of a block test)', () => {
  const { html, css } = renderBlock(heading, {
    headingTitle: text('Hello'),
    headingDesc: text('World'),
    headingDescToggle: true,
    headingAlign: 'center',
  });
  expect(html).toContain('<h2 class="pr-heading__text">Hello</h2>');
  expect(html).toContain('World');
  expect(css).toContain('.pr-block-test0001');
});
