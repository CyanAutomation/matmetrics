'use client';

import { Loader2, Save, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SessionLogFormFooterProps = {
  isSubmitting: boolean;
  isEditing: boolean;
  shouldHideHeader: boolean;
  feedbackState: 'idle' | 'loading' | 'success' | 'error';
  onCancel?: () => void;
};

export function SessionLogFormFooter({
  isSubmitting,
  isEditing,
  shouldHideHeader,
  feedbackState,
  onCancel,
}: SessionLogFormFooterProps) {
  return (
    <div
      className={cn(
        'flex justify-end gap-3 bg-secondary/45 p-8',
        !shouldHideHeader && 'bg-secondary/45'
      )}
    >
      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          interaction="subtle"
          onClick={onCancel}
          disabled={isSubmitting}
          className="gap-2 h-11 px-6"
        >
          <Undo2 className="h-4 w-4" />
          Cancel
        </Button>
      )}
      <Button
        type="submit"
        disabled={isSubmitting}
        interaction="primary-action"
        feedbackState={isSubmitting ? 'loading' : feedbackState}
        className={cn(
          'gap-2 font-bold shadow-lg',
          !shouldHideHeader ? 'px-10 py-6 text-lg h-14' : 'px-8 py-5 h-12'
        )}
      >
        {isSubmitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Save className="h-5 w-5" />
        )}
        {isEditing ? 'Update Session' : 'Log Training Session'}
      </Button>
    </div>
  );
}
