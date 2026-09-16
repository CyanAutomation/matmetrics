import {
  type BackgroundJobRequest,
  type BackgroundJobResult,
  isBackgroundJobResult,
} from './background-jobs';
import { requestDataWorker } from './data-worker-client.server';

export async function enqueueBackgroundJob(
  userId: string,
  job: BackgroundJobRequest
): Promise<BackgroundJobResult> {
  const result = await requestDataWorker<unknown>('/v1/background-jobs', {
    method: 'POST',
    userId,
    body: job,
  });
  if (!isBackgroundJobResult(result)) {
    throw new Error('Background Worker returned an invalid job response');
  }
  return result;
}

export async function getBackgroundJob(
  userId: string,
  jobId: string
): Promise<BackgroundJobResult> {
  const result = await requestDataWorker<unknown>(
    `/v1/background-jobs/${encodeURIComponent(jobId)}`,
    { method: 'GET', userId }
  );
  if (!isBackgroundJobResult(result)) {
    throw new Error('Background Worker returned an invalid job response');
  }
  return result;
}
