import type { Scenario } from '../scenario.ts';
import { uc01 } from './uc01-focus-grid.ts';
import { uc02 } from './uc02-forced-layout.ts';
import { uc03 } from './uc03-search-input.ts';
import { uc04 } from './uc04-initial-load.ts';

export const SCENARIOS: readonly Scenario[] = [uc01, uc02, uc03, uc04];
