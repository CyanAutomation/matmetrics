'use client';

import { useId } from 'react';
import { EFFORT_LABELS, SessionCategory } from '@/lib/types';

type SessionReviewSummaryProps = {
  date: string;
  duration: string;
  description: string;
  notes: string;
  videoUrl: string;
  techniques: string[];
  effort: 1 | 2 | 3 | 4 | 5;
  category: SessionCategory;
};

function formatSessionDate(date: string): string {
  if (!date) return 'Not set';

  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
        parsed
      );
}

export function SessionReviewSummary({
  date,
  duration,
  description,
  notes,
  videoUrl,
  techniques,
  effort,
  category,
}: SessionReviewSummaryProps) {
  const id = useId();
  const summaryItems = [
    { label: 'Session type', value: category },
    { label: 'Date', value: formatSessionDate(date) },
    {
      label: 'Duration',
      value: duration ? `${duration} minutes` : 'Not added',
    },
    { label: 'Effort', value: EFFORT_LABELS[effort] },
    {
      label: 'Techniques',
      value: techniques.length > 0 ? techniques.join(', ') : 'None added',
    },
    {
      label: 'Practice description',
      value: description.trim() || 'Not added',
    },
    { label: 'Reflection', value: notes.trim() || 'Not added' },
    { label: 'Video', value: videoUrl.trim() || 'Not added' },
  ];

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-xl border bg-muted/25 p-4 sm:p-5"
    >
      <h3 id={`${id}-title`} className="text-sm font-semibold">
        Session summary
      </h3>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {summaryItems.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              {label}
            </dt>
            <dd
              className={`mt-0.5 text-sm text-foreground ${
                label === 'Video' ? 'break-all' : 'break-words'
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
