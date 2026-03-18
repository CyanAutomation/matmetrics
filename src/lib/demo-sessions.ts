import type { JudoSession } from './types';

export const DEMO_SESSIONS: JudoSession[] = [
  {
    id: 'demo-randori-combination-timing',
    date: '2026-03-17',
    effort: 4,
    category: 'Randori',
    duration: 78,
    techniques: ['Ko-uchi-gari', 'Uchi-mata', 'Sasae-tsuri-komi-ashi'],
    description:
      'The focus was attacking off the first broken step instead of resetting after every grip exchange. The Ko-uchi-gari to Uchi-mata combination started landing cleanly once I stayed chest-up through the turn.',
    notes:
      'Best randori of the last two weeks. Still need to commit faster when Sasae-tsuri-komi-ashi stalls the lead foot.',
  },
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
  {
    id: 'demo-technical-recovery-uchikomi',
    date: '2026-03-04',
    effort: 1,
    category: 'Technical',
    duration: 45,
    techniques: ['Ashi-waza', 'Uchi-komi', 'Tai-sabaki'],
    description:
      'Light recovery session built around footwork patterns, movement entries, and relaxed Uchi-komi. No hard throws, just trying to make the step, turn, and posture feel automatic again.',
    notes:
      'Exactly the right pace for sore legs. The timing is fine; the left foot still drifts too wide on repeated turns.',
  },
  {
    id: 'demo-shiai-scoreboard-pressure',
    date: '2026-02-28',
    effort: 4,
    category: 'Shiai',
    duration: 82,
    techniques: ['Ippon-seoi-nage', 'Kumi-kata', 'O-soto-gari'],
    description:
      'Ran short scoreboard rounds with penalties and golden-score restarts. The rounds felt sharper when I established the collar grip early and forced the pace instead of waiting for a perfect entry.',
    notes:
      'Good urgency overall. I gave up initiative twice by backing straight out after a failed Ippon-seoi-nage.',
  },
  {
    id: 'demo-technical-newaza-chain',
    date: '2026-02-24',
    effort: 2,
    category: 'Technical',
    duration: 68,
    techniques: ['Juji-gatame', 'Tate-shiho-gatame', 'Ne-waza transition'],
    description:
      'Spent most of the session on turnovers and armbar entries after a defended throw. The cleaner reps came when I paused for control before chasing the finish.',
    notes:
      'Need tighter knees in Tate-shiho-gatame. The Juji-gatame entry is there if I stop rushing the leg over the head.',
  },
  {
    id: 'demo-randori-short-grip-frustration',
    date: '2026-02-19',
    effort: 3,
    category: 'Randori',
    duration: 52,
    techniques: ['Kumi-kata', 'Sode-tsuri-komi-goshi', 'De-ashi-barai'],
    description:
      'Short rounds started from neutral grips, and I spent too much time hand-fighting without creating a real attacking rhythm. The few productive exchanges came when I used De-ashi-barai to interrupt instead of trying to muscle into Sode-tsuri-komi-goshi.',
    notes:
      'Frustrating session. Fix the first contact and stop accepting a dead sleeve grip.',
  },
  {
    id: 'demo-shiai-uneven-pressure-rounds',
    date: '2026-02-13',
    effort: 5,
    category: 'Shiai',
    duration: 88,
    techniques: ['Tani-otoshi', 'Uchi-mata', 'Kesa-gatame'],
    description:
      'Hard match-style rounds with coaches calling tempo changes from the side. A few attacks were sharp, but I also forced low-percentage entries late and got punished when I chased from too far away.',
    notes:
      'This one exposed bad decision-making under fatigue. Settle the grip, attack once with intent, then transition instead of forcing a second scramble.',
  },
];
