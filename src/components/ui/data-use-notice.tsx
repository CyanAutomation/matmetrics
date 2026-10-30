import { cn } from '@/lib/utils';

const DATA_USE_COPY = {
  checkin:
    'Your session description and notes, selected type, effort rating, and up to 12 saved technique tags are sent to an external service for this optional check-in. Review suggestions before applying them.',
  'tag-suggestions':
    'When you request tag suggestions, your description is sent to an external service to generate them. Suggested tags may also be sent for optional verification.',
  history:
    "Optional review sends descriptions, notes, session types, effort ratings, and up to 12 saved technique tags from every described session loaded in your training history to an external service in small batches. It also classifies recurring training themes. Session IDs are kept in MatMetrics. Suggestions don't change anything unless you edit and save a session.",
  'semantic-history-search':
    'For each search, your query and selected details for up to eight sessions (date, type, effort, technique tags, and short excerpts from descriptions and notes), chosen locally by text relevance and recency, are sent to an external AI service to rank likely matches. Text matches appear immediately and remain in the results. Session IDs and your full history are not sent to that service. Results only suggest sessions and do not change them.',
  audit:
    'When semantic checks are enabled, each session with a description sends its description, notes, selected type, effort rating, and up to 12 saved technique tags to an external service. These checks are advisory and never change a session; exact checks still run if semantic review is unavailable.',
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
