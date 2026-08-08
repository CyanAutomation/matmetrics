import { useCallback } from 'react';

import {
  addTechnique,
  mergeSuggestedTechniques,
  removeTechnique,
} from '@/lib/session-form-actions';
import { useSessionFormAi } from './use-session-form-ai';
import type { useSessionFormState } from './use-session-form';

type SessionFormState = ReturnType<typeof useSessionFormState>;

export function useSessionLogFormActions(
  formState: SessionFormState,
  aiForm: ReturnType<typeof useSessionFormAi>
) {
  const handleAddTech = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      const nextTechniques = addTechnique(
        formState.techniques,
        formState.newTech
      );
      if (nextTechniques !== formState.techniques) {
        formState.setTechniques(nextTechniques);
        formState.setNewTech('');
      }
    },
    [formState]
  );

  const handleTransform = useCallback(async () => {
    await aiForm.transform(formState.description, (description) => {
      formState.setDescription(description);
    });
  }, [aiForm, formState]);

  const handleSuggest = useCallback(async () => {
    await aiForm.suggest(
      formState.description,
      formState.techniques,
      (suggestions) => {
        formState.setTechniques((previous) =>
          mergeSuggestedTechniques(previous, suggestions)
        );
      }
    );
  }, [aiForm, formState]);

  const handleRemoveTech = useCallback(
    (technique: string) => {
      formState.setTechniques((previous) =>
        removeTechnique(previous, technique)
      );
    },
    [formState]
  );

  return { handleAddTech, handleTransform, handleSuggest, handleRemoveTech };
}
