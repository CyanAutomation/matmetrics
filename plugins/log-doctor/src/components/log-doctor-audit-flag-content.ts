import { type AuditFlag, type AuditFlagCode } from '@/lib/types';

type FlagPresentation = {
  label: string;
  groupHeading: string;
  helperText: string;
};

export const AUDIT_FLAG_PRESENTATION: Record<AuditFlagCode, FlagPresentation> =
  {
    no_techniques_high_effort: {
      label: 'Missing techniques in hard sessions',
      groupHeading: 'What to fix now',
      helperText:
        'Add at least one technique name so this session shows what you practiced.',
    },
    empty_description: {
      label: 'Missing session summary',
      groupHeading: 'What to fix now',
      helperText:
        'Write 1–2 sentences about what you worked on during this session.',
    },
    empty_notes: {
      label: 'Missing follow-up notes',
      groupHeading: 'What to fix now',
      helperText:
        'Add notes about what felt good and what to change next time.',
    },
    duration_outlier: {
      label: 'Session time looks off',
      groupHeading: 'What to fix now',
      helperText:
        'Double-check the session time and correct it if it looks too high or too low.',
    },
  };

export const groupAuditFlagsByHeading = (
  flags: AuditFlag[]
): Record<string, AuditFlag[]> =>
  flags.reduce<Record<string, AuditFlag[]>>((grouped, flag) => {
    const presentation = AUDIT_FLAG_PRESENTATION[flag.code];
    if (!presentation) {
      throw new Error(
        `Missing presentation config for audit flag code: ${flag.code}`
      );
    }
    const heading = presentation.groupHeading;
    if (!grouped[heading]) {
      grouped[heading] = [];
    }
    grouped[heading].push(flag);
    return grouped;
  }, {});
