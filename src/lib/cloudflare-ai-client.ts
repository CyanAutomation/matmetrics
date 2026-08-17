import { InvalidAiResponseError } from './ai-api-error';

interface CloudflareAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CloudflareAiRequest {
  messages: CloudflareAiMessage[];
  maxTokens?: number;
}

interface CloudflareAiResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

const CLOUDFLARE_GATEWAY_URL =
  'https://gateway.ai.cloudflare.com/v1/c40f3cb30efbf8c6d081cf9e50a61931/default/compat/chat/completions';

/**
 * Calls the Cloudflare AI Gateway with the specified messages.
 * @throws {InvalidAiResponseError} If the response is empty or malformed
 * @throws {Error} For HTTP errors (401, 429, 503, etc.)
 */
export async function callCloudflareAi(
  request: CloudflareAiRequest
): Promise<string> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error('CLOUDFLARE_API_TOKEN environment variable is not set');
  }

  const response = await fetch(CLOUDFLARE_GATEWAY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dynamic/matmetrics',
      messages: request.messages,
      max_tokens: request.maxTokens ?? 1024,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Cloudflare AI authentication failed');
    }
    if (response.status === 429) {
      throw new Error('Cloudflare AI rate limit exceeded');
    }
    if (response.status === 503) {
      throw new Error('Cloudflare AI service unavailable');
    }
    throw new Error(
      `Cloudflare AI request failed with status ${response.status}`
    );
  }

  const data: CloudflareAiResponse = await response.json();

  if (data.error?.message) {
    throw new Error(`Cloudflare AI error: ${data.error.message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content || content.trim() === '') {
    throw new InvalidAiResponseError();
  }

  return content.trim();
}
