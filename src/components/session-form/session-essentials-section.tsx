'use client';

import { VanillaRadioGroup } from '@/components/vanilla-radio-group';
import { VanillaSelectField } from '@/components/vanilla-select-field';
import { VanillaTextField } from '@/components/vanilla-text-field';
import { RessaImage } from '@/components/ressa-image';
import { EFFORT_LABELS, SessionCategory } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SessionEssentialsSectionProps {
  date: string;
  duration: string;
  category: SessionCategory;
  availableCategories: SessionCategory[];
  effort: 1 | 2 | 3 | 4 | 5;
  showAvatar: boolean;
  shouldHideHeader: boolean;
  fid: (suffix: string) => string;
  setDate: (value: string) => void;
  setDuration: (value: string) => void;
  setCategory: (value: SessionCategory) => void;
  setEffort: (value: 1 | 2 | 3 | 4 | 5) => void;
}

export function SessionEssentialsSection({
  date,
  duration,
  category,
  availableCategories,
  effort,
  showAvatar,
  shouldHideHeader,
  fid,
  setDate,
  setDuration,
  setCategory,
  setEffort,
}: SessionEssentialsSectionProps) {
  return (
    <fieldset
      className={cn(
        '@container/essentials bg-secondary/25 rounded-lg p-4 @min-[56rem]/essentials:-mx-0 @min-[56rem]/essentials:rounded-lg @min-[56rem]/essentials:p-5 @min-[56rem]/essentials:bg-secondary/25',
        !shouldHideHeader && '-mx-6 -mt-6'
      )}
    >
      <legend className="px-1 text-sm font-semibold text-foreground">
        Session essentials
      </legend>
      <div className="flex flex-col items-start gap-4 @min-[56rem]/essentials:flex-row @min-[56rem]/essentials:gap-6">
        {/* Keep the illustration beside the fields only when the full row fits. */}
        {showAvatar && (
          <div className="hidden shrink-0 @min-[56rem]/essentials:flex">
            <RessaImage
              pose={1}
              size="medium"
              alt="Ressa in coach mode, ready to help log your training session"
              className="shrink-0"
            />
          </div>
        )}

        {/* Session Control Fields */}
        <div className="flex-1 w-full space-y-4">
          {/* Row 1: Date, Duration, Type */}
          <div className="grid grid-cols-1 items-start gap-4 @min-[34rem]/essentials:grid-cols-2 @min-[48rem]/essentials:grid-cols-3 @min-[56rem]/essentials:gap-6">
            {/* Session Date */}
            <VanillaTextField
              id={fid('date')}
              name="sessionDate"
              label="Session date"
              type="date"
              value={date}
              onInput={setDate}
              required
              size="comfortable"
              surface="background"
            />

            {/* Duration */}
            <VanillaTextField
              id={fid('duration')}
              name="sessionDuration"
              label="Duration (minutes)"
              type="number"
              value={duration}
              onInput={setDuration}
              min={1}
              max={999}
              step={1}
              placeholder="90"
              title="How long was your practice session in minutes?"
              ariaLabel="Session duration in minutes"
              optional
              hint="An estimate is fine."
              size="comfortable"
              surface="background"
            />

            {/* Session Type */}
            <VanillaSelectField
              id={fid('category')}
              label="Session type"
              value={category}
              options={availableCategories.map(value => ({ value, label: value }))}
              required
              onChange={(value) => setCategory(value as SessionCategory)}
            />
          </div>

          {/* Row 2: Effort Level (Full Width) */}
          <div className="space-y-2.5">
            <VanillaRadioGroup
              id={fid('effort')}
              label="Effort level"
              value={String(effort)}
              summary={EFFORT_LABELS[effort]}
              layout="responsive"
              required
              options={[1, 2, 3, 4, 5].map((value) => ({
                value: String(value),
                label: EFFORT_LABELS[value as typeof effort],
              }))}
              onChange={(value) => setEffort(Number(value) as typeof effort)}
            />
            <p className="text-xs text-muted-foreground">
              Required fields are marked with an asterisk. Technique tags and
              reflection are optional.
            </p>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
