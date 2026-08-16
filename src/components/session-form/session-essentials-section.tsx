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
import { EFFORT_LABELS, EFFORT_COLORS } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SessionEssentialsSectionProps {
  date: string;
  duration: string;
  category: 'Technical' | 'Randori' | 'Shiai';
  effort: 1 | 2 | 3 | 4 | 5;
  showAvatar: boolean;
  shouldHideHeader: boolean;
  fid: (suffix: string) => string;
  setDate: (value: string) => void;
  setDuration: (value: string) => void;
  setCategory: (value: 'Technical' | 'Randori' | 'Shiai') => void;
  setEffort: (value: 1 | 2 | 3 | 4 | 5) => void;
}

export function SessionEssentialsSection({
  date,
  duration,
  category,
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
        'bg-secondary/25 rounded-lg p-4 lg:-mx-0 lg:rounded-lg lg:p-5 lg:bg-secondary/25',
        !shouldHideHeader && '-mx-6 -mt-6'
      )}
    >
      <legend className="px-1 text-sm font-semibold text-foreground">
        Session essentials
      </legend>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
        {/* Avatar - Hidden on mobile, visible on lg and above */}
        {showAvatar && (
          <div className="hidden md:flex shrink-0">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 items-start">
            {/* Session Date */}
            <div className="space-y-2.5">
              <Label
                htmlFor={fid('date')}
                className="text-sm font-semibold block h-5"
              >
                Session Date
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
                Duration (minutes)
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
                Session Type
              </Label>
              <Select
                name="sessionCategory"
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
                  <SelectItem value="Technical">Technical</SelectItem>
                  <SelectItem value="Randori">Randori</SelectItem>
                  <SelectItem value="Shiai">Shiai</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Effort Level (Full Width) */}
          <div className="space-y-2.5">
            <div className="h-5 flex items-center justify-between">
              <Label className="text-sm font-semibold">Effort Level</Label>
              <span className="text-xs text-muted-foreground">
                {EFFORT_LABELS[effort]}
              </span>
            </div>
            <div
              className="flex gap-2 rounded-md bg-background/90 p-1.5"
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
                    onClick={() => setEffort(effortVal)}
                    className={cn(
                      'min-h-10 flex-1 px-1 font-semibold transition-all duration-200 text-sm',
                      isSelected
                        ? `${EFFORT_COLORS[effortVal]} border border-current shadow-sm`
                        : 'border border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    title={EFFORT_LABELS[effortVal]}
                    aria-label={`Effort level: ${EFFORT_LABELS[effortVal]}`}
                    aria-pressed={isSelected}
                  >
                    <span className="sm:hidden">{val}</span>
                    <span className="hidden sm:inline">
                      {EFFORT_LABELS[effortVal]}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
