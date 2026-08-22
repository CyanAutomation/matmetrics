'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown } from 'lucide-react';

interface OptionalFieldsSectionProps {
  videoUrl: string;
  notes: string;
  setVideoUrl: (value: string) => void;
  setNotes: (value: string) => void;
  videoUrlValidationMessage: string;
  isSubmitting: boolean;
  fid: (suffix: string) => string;
}

export function OptionalFieldsSection({
  videoUrl,
  notes,
  setVideoUrl,
  setNotes,
  videoUrlValidationMessage,
  isSubmitting,
  fid,
}: OptionalFieldsSectionProps) {
  return (
    <details className="group rounded-xl bg-muted/35">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground marker:content-none">
        Add reflection or a relevant video{' '}
        <span className="font-normal">(optional)</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 px-4 pb-4">
        <div className="space-y-2">
          <Label
            htmlFor={fid('video-url')}
            className="text-sm font-semibold text-muted-foreground"
          >
            Relevant Video URL (Optional)
          </Label>
          <Input
            id={fid('video-url')}
            name="sessionVideoUrl"
            type="url"
            placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            aria-invalid={videoUrlValidationMessage ? 'true' : 'false'}
            className="bg-background"
          />
          {videoUrlValidationMessage ? (
            <p className="text-sm text-destructive">
              {videoUrlValidationMessage}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Paste a public YouTube or other http(s) video link related to this
              session.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label
            htmlFor={fid('notes')}
            className="text-sm font-semibold text-muted-foreground"
          >
            Reflection
          </Label>
          <Textarea
            id={fid('notes')}
            name="personalNotes"
            placeholder="How did you feel during the session? What did you learn?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[128px] bg-background"
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground">
            Optional personal notes or reflections on the session.
          </p>
        </div>
      </div>
    </details>
  );
}
