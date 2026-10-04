'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
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
            <div className="space-y-2.5">
              <Label
                htmlFor={fid('date')}
                className="text-sm font-semibold block h-5"
              >
                Session date <span aria-hidden="true">*</span>
              </Label>
              <Input
                id={fid('date')}
                name="sessionDate"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="bg-background h-11"
              />
            </div>

            {/* Duration */}
            <div className="space-y-2.5">
              <Label
                htmlFor={fid('duration')}
                className="text-sm font-semibold block h-5"
              >
                Duration (minutes){' '}
                <span className="font-normal text-muted-foreground">
                  optional
                </span>
              </Label>
              <Input
                id={fid('duration')}
                name="sessionDuration"
                type="number"
                min="1"
                max="999"
                placeholder="90"
                title="How long was your practice session in minutes?"
                aria-label="Session duration in minutes"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="bg-background h-11"
              />
              <p className="text-xs text-muted-foreground">
                An estimate is fine.
              </p>
            </div>

            {/* Session Type */}
            <div className="space-y-2.5">
              <Label
                htmlFor={fid('category')}
                className="text-sm font-semibold block h-5"
              >
                Session type <span aria-hidden="true">*</span>
              </Label>
              <Select
                value={category}
                onValueChange={(val) => setCategory(val as typeof category)}
              >
                <SelectTrigger
                  id={fid('category')}
                  className="bg-background h-11"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((availableCategory) => (
                    <SelectItem
                      key={availableCategory}
                      value={availableCategory}
                    >
                      {availableCategory}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Effort Level (Full Width) */}
          <div className="space-y-2.5">
            <div className="h-5 flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Effort level <span aria-hidden="true">*</span>
              </Label>
              <span className="text-xs text-muted-foreground">
                {EFFORT_LABELS[effort]}
              </span>
            </div>
            <div
              className="grid grid-cols-2 gap-2 rounded-md bg-background/90 p-1.5 @min-[30rem]/essentials:grid-cols-5"
              role="group"
              aria-label="Perceived session effort, from easy to intense"
            >
              {[1, 2, 3, 4, 5].map((val) => {
                const effortVal = val as typeof effort;
                const isSelected = effort === effortVal;
                return (
                  <Button
                    key={fid(`effort-${val}`)}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    onClick={() => setEffort(effortVal)}
                    className={cn(
                      'min-h-10 min-w-0 px-1 text-[11px] font-semibold leading-none transition-all duration-200 @min-[30rem]/essentials:px-2 @min-[30rem]/essentials:text-sm',
                      isSelected
                        ? 'border border-primary text-primary-foreground shadow-sm'
                        : 'border border-input bg-background text-foreground hover:bg-muted'
                    )}
                    title={EFFORT_LABELS[effortVal]}
                    aria-label={`Effort level: ${EFFORT_LABELS[effortVal]}`}
                    aria-pressed={isSelected}
                  >
                    {EFFORT_LABELS[effortVal]}
                  </Button>
                );
              })}
            </div>
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
