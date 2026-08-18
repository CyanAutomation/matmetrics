import { InvalidAiResponseError } from './ai-api-error';

interface CloudflareAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CloudflareAiRequest {
  messages: CloudflareAiMessage[];
  maxTokens?: number;
}

interface CloudflareContentPart {
  text?: string;
}

interface CloudflareAiResponse {
  choices?: Array<{
    message?: {
      content?: string | CloudflareContentPart[] | null;
      reasoning?: string;
    };
    finish_reason?: string;
  }>;
  error?: {
    message?: string;
  };
}

// Cloudflare AI Gateway endpoint (OpenAI-compatible)
const CLOUDFLARE_GATEWAY_URL =
  'https://gateway.ai.cloudflare.com/v1/c40f3cb30efbf8c6d081cf9e50a61931/default/compat/chat/completions';

/**
 * Parse Cloudflare Gateway content which can be either:
 * - A plain string
 * - An array of objects with text properties
 */
function parseGatewayContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => part?.text ?? String(part)).join('');
  }
  return '';
}

/**
 * Calls the Cloudflare AI Gateway with the specified messages.
 * Uses OpenAI-compatible format via Cloudflare's /compat endpoint.
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
      'cf-aig-authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dynamic/matmetrics',
      messages: request.messages,
      max_tokens: request.maxTokens ?? 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Cloudflare AI request failed:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });

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
    console.error('Cloudflare AI error in response:', data.error);
    throw new Error(`Cloudflare AI error: ${data.error.message}`);
  }

  const choice = data.choices?.[0];
  const message = choice?.message;
  let rawContent = message?.content;

  // Handle reasoning models that may put content in the reasoning field
  // when they run out of tokens during reasoning (finish_reason: "length")
  if ((rawContent === null || rawContent === undefined) && message?.reasoning) {
    console.warn('Content is null, attempting to extract from reasoning field');
    rawContent = message.reasoning;
  }

  const content = parseGatewayContent(rawContent);

  if (!content || content.trim() === '') {
    console.error('Empty or invalid Cloudflare response:', {
      hasChoices: !!data.choices,
      hasMessage: !!message,
      finishReason: choice?.finish_reason,
      contentIsNull: rawContent === null,
      hasReasoning: !!message?.reasoning,
      rawContent,
      parsedContent: content,
    });
    throw new InvalidAiResponseError();
  }

  return content.trim();
}
