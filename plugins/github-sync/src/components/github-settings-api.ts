export type GitHubApiResult = { success: boolean; message: string };

export function parseGitHubApiPayload(
  payload: unknown,
  fallbackMessage: string,
  fallbackSuccess: boolean
): GitHubApiResult {
  const message =
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof payload.message === 'string' &&
    payload.message.trim()
      ? payload.message
      : fallbackMessage;
  const success =
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    typeof payload.success === 'boolean'
      ? payload.success
      : fallbackSuccess;
  return { success, message };
}

export async function parseGitHubApiResponse(
  response: Response,
  fallbackMessage: string
): Promise<GitHubApiResult> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return response.ok
      ? { success: true, message: fallbackMessage }
      : {
          success: false,
          message: `Server error (${response.status}). ${fallbackMessage}`,
        };
  }

  return parseGitHubApiPayload(payload, fallbackMessage, response.ok);
}
