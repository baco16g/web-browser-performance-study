import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import './custom.css';

/** 章を直接開いた人にも、誰が書いた解説かが分かるようにする */
const AUTHORSHIP_NOTE =
  'この解説は、Claude（Anthropic の AI）が React のソースコードと実測をもとに書いたものです。';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'doc-before': () => h('p', { class: 'authorship-note' }, AUTHORSHIP_NOTE),
    }),
} satisfies Theme;
