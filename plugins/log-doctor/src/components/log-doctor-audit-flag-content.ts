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
    category_mismatch: {
      label: 'Possible session type mismatch',
      groupHeading: 'Review training details',
      helperText:
        'Review the session type and change it only if the suggested type better matches what you did.',
    },
    unsupported_technique_tags: {
      label: 'Saved techniques not supported by the entry',
      groupHeading: 'Review training details',
      helperText:
        'Check the description and notes, then edit saved techniques only if you choose to.',
    },
    effort_conflict: {
      label: 'Effort may conflict with the text',
      groupHeading: 'Review training details',
      helperText:
        'Compare the entry with your selected effort and update either only if needed.',
    },
    low_information: {
      label: 'Little reusable training detail',
      groupHeading: 'Improve future recall',
      helperText:
        'Add one concrete technique, drill, or training focus if it would help you remember this session.',
    },
    missing_reflection: {
      label: 'Reflection suggestion',
      groupHeading: 'Improve future recall',
      helperText:
        'Add a note about what worked, what was difficult, or what you want to try next time if useful.',
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
