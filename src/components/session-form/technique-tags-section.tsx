'use client';

import { Button } from '@/components/ui/button';
import { DataUseNotice } from '@/components/ui/data-use-notice';
import { VanillaTagEditor } from '@/components/vanilla-tag-editor';
import { Sparkles, Loader2 } from 'lucide-react';

interface TechniqueTagsSectionProps {
  techniques: string[];
  newTech: string;
  setNewTech: (value: string) => void;
  canUseAi: boolean;
  isSubmitting: boolean;
  suggestLoading: boolean;
  suggestMessage: string | null;
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
  suggestMessage,
  description,
  fid,
  onSuggest,
  onAddTech,
  onRemoveTech,
}: TechniqueTagsSectionProps) {
  return (
    <div className="space-y-4 pt-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label-md text-muted-foreground">
          Technique tags
        </span>
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
      <DataUseNotice variant="tag-suggestions" />
      <VanillaTagEditor
        id={fid('manual-tag')}
        label="Technique tags"
        inputLabel="Add a technique tag"
        name="manualTagEntry"
        values={techniques}
        newValue={newTech}
        placeholder="Add a technique (e.g. O-soto-gari)"
        emptyMessage="Technique tags are optional."
        addDisabled={isSubmitting}
        onInput={setNewTech}
        onAdd={onAddTech}
        onRemove={onRemoveTech}
      />
      {suggestMessage ? (
        <p role="status" className="text-xs text-muted-foreground">
          {suggestMessage}
        </p>
      ) : null}
    </div>
  );
}
