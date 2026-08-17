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
  result?: {
    response?: string;
  };
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  errors?: Array<{
    message?: string;
  }>;
  error?: {
    message?: string;
  };
  success?: boolean;
}

const CLOUDFLARE_API_URL =
  'https://api.cloudflare.com/client/v4/accounts/c40f3cb30efbf8c6d081cf9e50a61931/ai/run';

/**
 * Calls the Cloudflare AI API with the specified messages.
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

  const response = await fetch(CLOUDFLARE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'cf-aig-gateway-id': 'default',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dynamic/matmetrics',
      input: {
        messages: request.messages,
        max_tokens: request.maxTokens ?? 1024,
      },
    }),
  });

  const data: CloudflareAiResponse = await response.json();

  if (!response.ok) {
    const errorMessage =
      data.errors?.[0]?.message ||
      data.error?.message ||
      `HTTP ${response.status}`;

    if (response.status === 401) {
      throw new Error(`Cloudflare AI authentication failed: ${errorMessage}`);
    }
    if (response.status === 429) {
      throw new Error(`Cloudflare AI rate limit exceeded: ${errorMessage}`);
    }
    if (response.status === 503) {
      throw new Error(
        `Cloudflare AI service unavailable: ${errorMessage}`
      );
    }
    throw new Error(
      `Cloudflare AI request failed with status ${response.status}: ${errorMessage}`
    );
  }

  // Check for Cloudflare-style errors even with 200 status
  if (data.success === false || data.errors) {
    const errorMessage =
      data.errors?.[0]?.message || 'Unknown Cloudflare API error';
    throw new Error(`Cloudflare AI error: ${errorMessage}`);
  }

  if (data.error?.message) {
    throw new Error(`Cloudflare AI error: ${data.error.message}`);
  }

  // Try both response formats: direct API (result.response) and gateway (choices)
  const content =
    data.result?.response || data.choices?.[0]?.message?.content;

  if (!content || content.trim() === '') {
    throw new InvalidAiResponseError();
  }

  return content.trim();
}
