import type { JudoSession } from './types';

/** Dates are resolved when a new guest preview is seeded, so its weekly insights stay current. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

const session = (
  id: string,
  days: number,
  effort: 1 | 2 | 3 | 4 | 5,
  category: JudoSession['category'],
  duration: number,
  techniques: string[],
  description: string,
  notes: string,
  videoUrl?: string
): JudoSession => ({
  id,
  date: daysAgo(days),
  effort,
  category,
  duration,
  techniques,
  description,
  notes,
  ...(videoUrl ? { videoUrl } : {}),
});

/** A varied, active 16-week block. Uchi-mata is a focus, not a foregone conclusion. */
export const DEMO_SESSIONS: JudoSession[] = [
  session(
    'demo-randori-attack-initiative',
    0,
    4,
    'Randori',
    78,
    ['Uchi-mata', 'Ko-uchi-gari', 'De-ashi-barai'],
    'Hard neutral-grip rounds: attack before the exchange settles and use foot sweeps to create a reaction.',
    'The first attack was decisive; keep the sleeve active after a failed entry.'
  ),
  session(
    'demo-technical-osoto-review',
    2,
    2,
    'Technical',
    62,
    ['O-soto-gari', 'O-uchi-gari', 'Kuzushi'],
    'Technical work on breaking posture to the rear corner before committing to O-soto-gari.',
    'Turn the upper body before reaping; do not chase the leg.',
    'https://www.youtube.com/watch?v=c-A_nP7mKAc'
  ),
  session(
    'demo-shiai-pressure-rounds',
    4,
    5,
    'Shiai',
    88,
    ['Seoi-nage', 'Uchi-mata', 'Ne-waza'],
    'Match-paced rounds with short recovery and scoreboard pressure.',
    'Reset earlier after a defended attack near the edge.'
  ),
  session(
    'demo-technical-juji-gatame',
    6,
    2,
    'Technical',
    68,
    ['Juji-gatame', 'Turnover', 'Ne-waza'],
    'Turtle turnovers into Juji-gatame, prioritising control before the finish.',
    'Keep the hips close and slow the transition.',
    'https://www.youtube.com/watch?v=ax6iWncqawg'
  ),
  session(
    'demo-randori-left-sided-partners',
    9,
    4,
    'Randori',
    74,
    ['Sasae-tsuri-komi-ashi', 'Uchi-mata', 'Kumi-kata'],
    'Grip-fighting and attacking against left-sided partners.',
    'The sleeve hand needs to arrive sooner when changing sides.'
  ),
  session(
    'demo-technical-seoi-entries',
    11,
    3,
    'Technical',
    72,
    ['Ippon-seoi-nage', 'Morote-seoi-nage', 'Tai-sabaki'],
    'Moving entries for both one-arm and two-arm seoi-nage.',
    'Create space with a lateral step before turning under.'
  ),
  session(
    'demo-technical-recovery-mobility',
    14,
    1,
    'Technical',
    45,
    ['Ukemi', 'Tai-sabaki', 'Uchi-komi'],
    'Light recovery: breakfalls, footwork, and low-volume Uchi-komi.',
    'Keeping the head upright makes the first step cleaner.'
  ),
  session(
    'demo-randori-ground-transitions',
    16,
    3,
    'Randori',
    66,
    ['Osaekomi-waza', 'Sankaku-jime', 'Turnover'],
    'Continued every standing exchange to the ground and settled control before submissions.',
    'Trap the far arm before advancing to Sankaku-jime.'
  ),
  session(
    'demo-technical-kouchi-chain',
    19,
    3,
    'Technical',
    76,
    ['Ko-uchi-gari', 'Uchi-mata', 'Harai-goshi'],
    'Forward attacking chain from Ko-uchi-gari to a turn throw.',
    'Ko-uchi-gari must be a committed attack, not a token feint.'
  ),
  session(
    'demo-shiai-golden-score',
    22,
    5,
    'Shiai',
    94,
    ['Uchi-mata', 'Tani-otoshi', 'Osaekomi-waza'],
    'Long rounds with golden-score scenarios and immediate ground follow-ups.',
    'Decision-making improved under fatigue; avoid defensive grips.'
  ),
  session(
    'demo-technical-grip-sequencing',
    24,
    2,
    'Technical',
    60,
    ['Kumi-kata', 'Uchi-mata', 'Ko-uchi-gari'],
    'Sleeve control, collar timing, then immediate attack after winning grips.',
    'Grip work needs to be sharp before the throw can work.'
  ),
  session(
    'demo-randori-ashiwaza-reactions',
    27,
    3,
    'Randori',
    70,
    ['De-ashi-barai', 'Okuri-ashi-barai', 'O-uchi-gari'],
    'Used foot sweeps to break rhythm and follow the reaction.',
    'Timing was best after a small pull rather than a big push.'
  ),
  session(
    'demo-technical-newaza-escapes',
    31,
    2,
    'Technical',
    64,
    ['Osaekomi-waza', 'Escape', 'Bridge-and-roll'],
    'Escapes from side control and kesa-gatame, then re-established pins.',
    'Build frames before bridging.'
  ),
  session(
    'demo-technical-harai-goshi',
    35,
    3,
    'Technical',
    80,
    ['Harai-goshi', 'Uchi-mata', 'Kuzushi'],
    'Compared Harai-goshi and Uchi-mata from the same sleeve-and-lapel position.',
    'Use Harai-goshi when the partner drives back.'
  ),
  session(
    'demo-randori-pace-management',
    38,
    4,
    'Randori',
    82,
    ['Uchi-mata', 'O-soto-gari', 'Kumi-kata'],
    'Alternated attacking bursts and deliberate grip resets with larger partners.',
    'O-soto-gari was the safer second attack today.'
  ),
  session(
    'demo-shiai-penalty-management',
    42,
    5,
    'Shiai',
    90,
    ['Seoi-nage', 'Sasae-tsuri-komi-ashi', 'Ne-waza'],
    'Competition rounds with penalties called for passivity and grip avoidance.',
    'Plan a clearer exit from a blocked seoi-nage.'
  ),
  session(
    'demo-technical-turnover-chain',
    46,
    2,
    'Technical',
    58,
    ['Turnover', 'Juji-gatame', 'Sankaku-jime'],
    'Ne-waza chains from turtle, selecting the finish from the near-arm position.',
    'Break the opponent down before isolating a limb.'
  ),
  session(
    'demo-randori-first-attack',
    50,
    3,
    'Randori',
    62,
    ['Ko-uchi-gari', 'Ippon-seoi-nage', 'O-uchi-gari'],
    'Short rounds with a rule to attack within the first exchange.',
    'Less hesitation against unfamiliar partners.'
  ),
  session(
    'demo-technical-uchimata-finishing',
    55,
    3,
    'Technical',
    84,
    ['Uchi-mata', 'Ko-uchi-gari', 'Tai-otoshi'],
    'Moved from Uchi-komi to nage-komi and finished Uchi-mata without drifting.',
    'Tai-otoshi remains a useful bailout option.',
    'https://www.youtube.com/watch?v=eAg2xg6aOyw'
  ),
  session(
    'demo-technical-balance-and-posture',
    60,
    1,
    'Technical',
    50,
    ['Ukemi', 'Kuzushi', 'Tai-sabaki'],
    'Low-intensity movement, balance, and posture work after a hard week.',
    'Recovery sessions are worth logging.'
  ),
  session(
    'demo-randori-neutral-grips',
    66,
    4,
    'Randori',
    75,
    ['Kumi-kata', 'De-ashi-barai', 'Seoi-nage'],
    'Neutral-grip rounds focused on winning inside position without a fixed setup.',
    'Attack while changing grips.'
  ),
  session(
    'demo-technical-oshi-taoshi',
    73,
    2,
    'Technical',
    66,
    ['Oshi-taoshi', 'Kumi-kata', 'Tai-sabaki'],
    'Explored a direct hand technique from a strong sleeve-and-lapel position.',
    'The entry needs broken posture first.'
  ),
  session(
    'demo-shiai-combination-rounds',
    80,
    5,
    'Shiai',
    86,
    ['O-uchi-gari', 'Uchi-mata', 'Osaekomi-waza'],
    'Match rounds built around combinations and follow-up scrambles.',
    'Keep the head position disciplined during the follow-up.'
  ),
  session(
    'demo-technical-pin-escapes',
    88,
    2,
    'Technical',
    56,
    ['Kesa-gatame', 'Escape', 'Osaekomi-waza'],
    'Revisited pin escapes and the details that stop chest-to-chest control.',
    'Start the escape before pressure is established.'
  ),
  session(
    'demo-randori-throw-selection',
    96,
    3,
    'Randori',
    68,
    ['O-soto-gari', 'Harai-goshi', 'Sasae-tsuri-komi-ashi'],
    'Selected throws from the opponent’s movement rather than forcing favourites.',
    'Sasae is becoming a genuine attack.'
  ),
  session(
    'demo-technical-foundations',
    105,
    2,
    'Technical',
    60,
    ['Uchi-mata', 'Kuzushi', 'Uchi-komi'],
    'Opened the block with foundational Uchi-mata entries and off-balancing drills.',
    'Aim for a cleaner first attack, not more volume.'
  ),
  session(
    'demo-randori-baseline',
    112,
    3,
    'Randori',
    64,
    ['Kumi-kata', 'O-uchi-gari', 'De-ashi-barai'],
    'Baseline randori before setting the block’s technical focus.',
    'Foot sweeps produced useful reactions and are a good reference point.'
  ),
];

/** Deliberately incomplete records for audit/validation demos; never seeded by default. */
export const AUDIT_DEMO_SESSIONS: JudoSession[] = [
  session(
    'audit-demo-high-effort-missing-techniques',
    3,
    5,
    'Randori',
    75,
    [],
    '',
    ''
  ),
  {
    ...session(
      'audit-demo-missing-reflection',
      12,
      3,
      'Technical',
      64,
      ['O-soto-gari'],
      'Drilled O-soto-gari entries from a standard right-handed grip.',
      ''
    ),
    notes: undefined,
  },
  session(
    'audit-demo-duration-outlier',
    20,
    2,
    'Technical',
    180,
    ['Uchi-komi', 'Tai-sabaki'],
    'Extended technical seminar with repeated entries and movement drills.',
    'Check whether the duration should include the full seminar block.'
  ),
];
