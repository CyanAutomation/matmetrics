import type { JudoSession } from './types';

export const DEMO_SESSIONS: JudoSession[] = [
  {
    id: 'demo-technical-kuzushi-chain',
    date: '2026-03-14',
    effort: 3,
    category: 'Technical',
    duration: 85,
    techniques: ['Uchi-mata', 'Ko-uchi-gari', 'Tai-otoshi'],
    description:
      'Focused on linking forward throws off broken posture. The cleanest entries came when I committed to the sleeve pull before stepping across for Uchi-mata.',
    notes:
      'Need a more decisive pivot when switching from Ko-uchi-gari to Tai-otoshi.',
  },
  {
    id: 'demo-randori-grip-battle',
    date: '2026-03-11',
    effort: 4,
    category: 'Randori',
    duration: 70,
    techniques: ['O-soto-gari', 'Sasae-tsuri-komi-ashi', 'Kumi-kata'],
    description:
      'Several rounds started from unfavorable grips, so the main goal was to win the first exchange and attack immediately rather than circling out.',
    notes:
      'Better posture under pressure, but I still reached with the lead hand too early.',
  },
  {
    id: 'demo-shiai-transition-work',
    date: '2026-03-08',
    effort: 5,
    category: 'Shiai',
    duration: 95,
    techniques: ['Ippon-seoi-nage', 'Tani-otoshi', 'Ne-waza transition'],
    description:
      'Competition-style rounds with short breaks. The emphasis was entering first and following missed throws into immediate groundwork.',
    notes:
      'Cardio held up well. Need cleaner decision-making when the first attack stalls.',
  },
];
