'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Wand2, Loader2 } from 'lucide-react';

interface PracticeDescriptionSectionProps {
  description: string;
  setDescription: (value: string) => void;
  canUseAi: boolean;
  isSubmitting: boolean;
  transformLoading: boolean;
  fid: (suffix: string) => string;
  onTransform: () => void;
}

export function PracticeDescriptionSection({
  description,
  setDescription,
  canUseAi,
  isSubmitting,
  transformLoading,
  fid,
  onTransform,
}: PracticeDescriptionSectionProps) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-foreground">
        What did you practise?
      </legend>
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTransform}
          interaction="subtle"
          feedbackState={transformLoading ? 'loading' : 'idle'}
          disabled={
            !canUseAi || transformLoading || isSubmitting || !description
          }
          className="h-8 gap-2 text-primary border-primary/20 hover:bg-primary/5 text-xs"
          title={
            !description ? 'Add practice notes to use AI Transform.' : undefined
          }
        >
          {transformLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          AI Transform
        </Button>
      </div>
      <Textarea
        id={fid('description')}
        name="practiceDescription"
        aria-label="What did you practise?"
        placeholder="A few notes about drills, throws, or focus..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="min-h-[112px] bg-background text-base"
      />
      <p className="text-xs text-muted-foreground">
        A sentence or two is enough. AI can polish the entry or suggest
        technique tags once you have added some detail.
      </p>
      {!description && canUseAi ? (
        <p className="text-xs text-muted-foreground">
          Add a few words to enable AI transform and tag suggestions.
        </p>
      ) : null}
    </fieldset>
  );
}
