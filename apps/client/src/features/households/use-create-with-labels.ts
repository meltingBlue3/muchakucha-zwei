import { useTranslation } from '../../i18n';
import { ApiClientError } from '@muchakucha/api-client';
import { hasRecurrenceFieldErrors } from '../recurrence/recurrence-options';
import { useRef, useState } from 'react';

/**
 * Labels go in the create request itself: a new series copies them to the
 * occurrences generated while it is saved, which a later labelling call misses.
 */
export function useCreateWithLabels<T extends { labelIds?: string[] }>({ create, onComplete }: {
  create(data: T): Promise<unknown>;
  onComplete(): void;
}) {
  const { t } = useTranslation('households');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'createNetworkError' | 'createValidationError' | 'createPermissionError' | 'createRetryError' | null>(null);
  const inFlight = useRef(false);
  const submit = async (data: T, labelIds: string[]) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await create({ ...data, labelIds });
      onComplete();
    } catch (failure) {
      // The repeat settings were refused: let the form show which field,
      // instead of a generic network message.
      if (hasRecurrenceFieldErrors(failure)) throw failure;
      // A server answer is not a network problem; only a request that never got one is.
      setError(!(failure instanceof ApiClientError) ? 'createNetworkError'
        : failure.status === 400 ? 'createValidationError'
          : failure.status === 403 ? 'createPermissionError'
            : 'createRetryError');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return { pending, error: error === null ? null : t(error), submit };
}
