import type { JudoSession } from './types';

export const DEMO_SESSIONS: JudoSession[] = [
  {
    id: 'demo-randori-posture-pressure',
    date: '2026-03-17',
    effort: 4,
    category: 'Randori',
    duration: 76,
    techniques: ['Uchi-mata', 'Ko-uchi-gari', 'Kumi-kata'],
    description:
      'Hard rounds from standard grips with a clear goal of attacking before the exchange went static. The best sequences came from forcing posture up with the sleeve and immediately threatening Ko-uchi-gari into Uchi-mata.',
    notes:
      'The combination is becoming reliable when I win the inside lapel first. I still bailed out too often after the first failed Uchi-mata entry.',
  },
  {
    id: 'demo-technical-uchimata-finishing',
    date: '2026-03-14',
    effort: 3,
    category: 'Technical',
    duration: 82,
    techniques: ['Uchi-mata', 'Ko-uchi-gari', 'Tai-otoshi'],
    description:
      'Repped the same forward chain from uchikomi into moving nage-komi. Most of the session was about finishing Uchi-mata without drifting across the center line and using Ko-uchi-gari when the partner pulled the lead leg back.',
    notes:
      'Tai-otoshi is still useful as a bailout option, but it is clearly secondary to the main Uchi-mata sequence right now.',
  },
  {
    id: 'demo-technical-recovery-footwork',
    date: '2026-03-11',
    effort: 1,
    category: 'Technical',
    duration: 48,
    techniques: ['Uchi-komi', 'Tai-sabaki', 'Kumi-kata'],
    description:
      'Kept the session light after a hard week. Mostly footwork rounds, shadow turns, and grip-entry patterns with no real throwing volume.',
    notes:
      'Good reminder that the first step is cleaner when I keep the head up and stop reaching for the sleeve from too far out.',
  },
  {
    id: 'demo-shiai-scoreboard-rounds',
    date: '2026-03-08',
    effort: 5,
    category: 'Shiai',
    duration: 92,
    techniques: ['Uchi-mata', 'Kumi-kata', 'Ne-waza transition'],
    description:
      'Competition rounds with penalties, short rest, and coaches calling pace. The successful attacks came when I established grips early and committed to the first Uchi-mata instead of waiting for a perfect opening.',
    notes:
      'Conditioning held up, but I lost two exchanges by accepting a defensive grip and trying to recover too late on the edge.',
  },
  {
    id: 'demo-randori-grip-denial',
    date: '2026-03-04',
    effort: 3,
    category: 'Randori',
    duration: 64,
    techniques: ['Kumi-kata', 'De-ashi-barai', 'Uchi-mata'],
    description:
      'Started every round from neutral grips and worked on breaking rhythm before attacking. De-ashi-barai was mostly there to force reactions back into the forward turn.',
    notes:
      'This felt better than the last neutral-grip session. I was much more willing to use foot sweeps as setup instead of hunting only the big throw.',
  },
  {
    id: 'demo-technical-newaza-followup',
    date: '2026-02-28',
    effort: 2,
    category: 'Technical',
    duration: 66,
    techniques: ['Ne-waza transition', 'Juji-gatame', 'Uchi-mata'],
    description:
      'Spent most of the class chaining missed throws into immediate control on the ground. The armbar entries were best when I settled chest pressure first instead of racing straight to the finish.',
    notes:
      'Useful complement to the standing work. If the Uchi-mata stalls, the transition is there as long as I do not pause upright.',
  },
  {
    id: 'demo-technical-ashiwaza-entries',
    date: '2026-02-24',
    effort: 2,
    category: 'Technical',
    duration: 58,
    techniques: ['Ko-uchi-gari', 'Sasae-tsuri-komi-ashi', 'Uchi-mata'],
    description:
      'Technical drilling centered on ashi-waza entries that feed the main turn throw. The idea was to make Ko-uchi-gari and Sasae feel like real attacks instead of token feints.',
    notes:
      'Ko-uchi-gari is the better fit for my timing. Sasae works when the partner is pushing back into me, but it still feels less natural.',
  },
  {
    id: 'demo-randori-uneven-pace',
    date: '2026-02-19',
    effort: 4,
    category: 'Randori',
    duration: 72,
    techniques: ['Uchi-mata', 'Ko-uchi-gari', 'O-soto-gari'],
    description:
      'Full rounds with several bigger training partners. When I attacked decisively, the forward chain was there; when I hesitated, I ended up reaching and getting moved backward.',
    notes:
      'O-soto-gari showed up a few times as the safer attack when I could not load the hips in for Uchi-mata.',
  },
  {
    id: 'demo-technical-grip-sequencing',
    date: '2026-02-13',
    effort: 3,
    category: 'Technical',
    duration: 74,
    techniques: ['Kumi-kata', 'Uchi-mata', 'Ko-uchi-gari'],
    description:
      'Dedicated most of class to first-contact sequences: sleeve control, collar timing, then immediate entry. The whole point was reducing the dead time between winning grips and launching the attack.',
    notes:
      'This session made it obvious that the throw fails later when the grip work is lazy early.',
  },
  {
    id: 'demo-shiai-fatigue-decisions',
    date: '2026-02-08',
    effort: 5,
    category: 'Shiai',
    duration: 86,
    techniques: ['Uchi-mata', 'Tani-otoshi', 'Ne-waza transition'],
    description:
      'Hard match-style rounds under fatigue with almost no coaching between sets. The first attacks were sharp, but later exchanges got messy when I chased too far after a defended entry.',
    notes:
      'Important reality check. If the first attack dies, I need to transition or reset instead of forcing a second bad entry.',
  },
  {
    id: 'demo-randori-first-attack-commitment',
    date: '2026-02-03',
    effort: 3,
    category: 'Randori',
    duration: 60,
    techniques: ['Ko-uchi-gari', 'Uchi-mata', 'Kumi-kata'],
    description:
      'Shorter rounds with an emphasis on attacking within the first exchange. The cleanest moments came from using Ko-uchi-gari to draw the weight forward and turning immediately before the grip fight reset.',
    notes:
      'Still too hesitant against left-sided partners, but the attacking intention was much better than last month.',
  },
  {
    id: 'demo-technical-osoto-balance',
    date: '2026-01-30',
    effort: 2,
    category: 'Technical',
    duration: 62,
    techniques: ['O-soto-gari', 'Kumi-kata', 'Tai-sabaki'],
    description:
      'Earlier-cycle technical session on posture and off-balancing for O-soto-gari. This was less about building a primary attack and more about having a dependable secondary direction when the forward turn was not there.',
    notes:
      'Worth keeping in the mix, but the standing identity of the block is clearly centered on Uchi-mata and its setups.',
  },
];
