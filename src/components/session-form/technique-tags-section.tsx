'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, X, Sparkles, Loader2 } from 'lucide-react';

interface TechniqueTagsSectionProps {
  techniques: string[];
  newTech: string;
  setNewTech: (value: string) => void;
  canUseAi: boolean;
  isSubmitting: boolean;
  suggestLoading: boolean;
  description: string;
  fid: (suffix: string) => string;
  onSuggest: () => void;
  onAddTech: () => void;
  onRemoveTech: (tech: string) => void;
}

export function TechniqueTagsSection({
  techniques,
  newTech,
  setNewTech,
  canUseAi,
  isSubmitting,
  suggestLoading,
  description,
  fid,
  onSuggest,
  onAddTech,
  onRemoveTech,
}: TechniqueTagsSectionProps) {
  return (
    <div className="space-y-4 pt-5">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-label-md text-muted-foreground">
          Technique tags
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSuggest}
          feedbackState={suggestLoading ? 'loading' : 'idle'}
          disabled={!canUseAi || suggestLoading || isSubmitting || !description}
          className="h-7 gap-1.5 text-muted-foreground hover:text-foreground text-xs"
          title={
            !description ? 'Add practice notes to suggest tags.' : undefined
          }
        >
          {suggestLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Suggest tags
        </Button>
      </div>
      <div className="flex min-h-[48px] flex-wrap gap-2 rounded-lg bg-muted/45 p-4 [[data-contrast='high']_&]:outline [[data-contrast='high']_&]:outline-[hsl(var(--color-outline-variant)/0.9)]">
        {techniques.length === 0 && (
          <span className="text-sm text-muted-foreground/60 flex items-center gap-1.5">
            <Brain className="h-4 w-4" />
            Technique tags are optional.
          </span>
        )}
        {techniques.map((tech) => (
          <Badge
            key={fid(`tech-badge-${tech}`)}
            className="gap-1 bg-primary text-white py-1.5 px-3 text-sm"
          >
            {tech}
            <button
              type="button"
              onClick={() => onRemoveTech(tech)}
              className="ml-1 rounded-full transition-[color,transform] duration-200 ease-snappy hover:text-destructive hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id={fid('manual-tag')}
          name="manualTagEntry"
          placeholder="Add a technique (e.g. O-soto-gari)"
          value={newTech}
          onChange={(e) => setNewTech(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAddTech();
            }
          }}
          className="bg-background h-10"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => onAddTech()}
          interaction="subtle"
          disabled={isSubmitting}
          className="h-10 px-6"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
