import { ApiClientError } from '@muchakucha/api-client';
import { hasRecurrenceFieldErrors } from '../recurrence/recurrence-options';
import { useRef, useState } from 'react';
import { useWorkspaceState } from '../../ui/workspace-state';

/** The created ID survives navigation, so retry only repeats the failed label step. */
export function useCreateWithLabels<T>({ key, create, tag, onComplete }: {
  key: string;
  create(data: T): Promise<{ id: string }>;
  tag(id: string, labelIds: string[]): Promise<unknown>;
  onComplete(): void;
}) {
  const [created, setCreated] = useWorkspaceState<{ id: string; labelIds: string[] } | null>(key, null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const run = async (data?: T, labelIds: string[] = []) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    let record = created;
    try {
      if (record === null) {
        if (data === undefined) return;
        const result = await create(data);
        record = { id: result.id, labelIds: [...labelIds] };
        setCreated(record);
      }
      if (record.labelIds.length > 0) await tag(record.id, record.labelIds);
      onComplete();
    } catch (failure) {
      // Nothing was created and the repeat settings were refused: let the form
      // show which field, instead of a generic network message.
      if (record === null && hasRecurrenceFieldErrors(failure)) throw failure;
      // A server answer is not a network problem; only a request that never got one is.
      const createFailure = !(failure instanceof ApiClientError) ? '创建失败，请检查网络后重试。'
        : failure.status === 400 ? '创建失败，请检查填写的内容后重试。'
          : failure.status === 403 ? '你没有权限在这个家庭创建内容。'
            : '创建失败，请稍后重试。';
      setError(record === null ? createFailure : '内容已创建，但标签未保存。重试只会保存标签，不会重复创建。');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return { created, pending, error, submit: (data: T, labels: string[]) => run(data, labels), retry: () => run() };
}
