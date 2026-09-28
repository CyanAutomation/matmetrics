import { cn } from '@/lib/utils';

const DATA_USE_COPY = {
  checkin:
    'Your session description and notes, selected type, effort rating, and up to 12 saved technique tags are sent to an external service for this optional check-in. Review suggestions before applying them.',
  'tag-suggestions':
    'When you request tag suggestions, your description is sent to an external service to generate them. Suggested tags may also be sent for optional verification.',
  history:
    "Optional review sends descriptions, notes, session types, effort ratings, and up to 12 saved technique tags from up to five sessions in this view to an external service. Suggestions don't change anything unless you edit and save a session.",
} as const;

export type DataUseNoticeVariant = keyof typeof DATA_USE_COPY;

export function DataUseNotice({
  variant,
  className,
}: {
  variant: DataUseNoticeVariant;
  className?: string;
}) {
  return (
    <p
      role="note"
      aria-label="Training data use"
      data-slot="data-use-notice"
      className={cn('text-xs text-muted-foreground', className)}
    >
      {DATA_USE_COPY[variant]}
    </p>
  );
}
