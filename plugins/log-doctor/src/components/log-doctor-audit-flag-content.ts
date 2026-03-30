import { type AuditFlag, type AuditFlagCode } from '@/lib/types';

type FlagPresentation = {
  label: string;
  groupHeading: string;
  helperText: string;
};

export const AUDIT_FLAG_PRESENTATION: Record<AuditFlagCode, FlagPresentation> =
  {
    no_techniques_high_effort: {
      label: 'No techniques (high effort)',
      groupHeading: 'Missing details',
      helperText:
        'Add at least one technique so this high-effort session has drill context.',
    },
    empty_description: {
      label: 'Missing description',
      groupHeading: 'Missing details',
      helperText:
        'Write 1–2 sentences describing what you worked on in this session.',
    },
    empty_notes: {
      label: 'Missing notes',
      groupHeading: 'Missing details',
      helperText:
        'Add quick notes on what felt good and what to improve next time.',
    },
    duration_outlier: {
      label: 'Unusual duration',
      groupHeading: 'Unusual values',
      helperText:
        'Check the duration and update it if the value is accidentally too high or low.',
    },
  };

export const groupAuditFlagsByHeading = (
  flags: AuditFlag[]
): Record<string, AuditFlag[]> =>
  flags.reduce<Record<string, AuditFlag[]>>((grouped, flag) => {
    const heading = AUDIT_FLAG_PRESENTATION[flag.code].groupHeading;
    if (!grouped[heading]) {
      grouped[heading] = [];
    }
    grouped[heading].push(flag);
    return grouped;
  }, {});
