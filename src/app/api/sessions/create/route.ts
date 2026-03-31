import { NextRequest, NextResponse } from 'next/server';
import { JudoSession, GitHubConfig } from '@/lib/types';
import {
  createSessionForConfig,
  normalizeGitHubConfig,
} from '@/lib/session-storage';
import {
  buildGitHubSessionBody,
  proxyGoFunction,
  shouldProxyGitHubRequests,
} from '@/lib/go-function-proxy';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { resolveAuthorizedGitHubConfig } from '@/lib/server-github-authz';
import crypto from 'crypto';
import { isBlockedNetworkHostname } from '@/lib/network-safety';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CREATE_CONFLICT_SIGNATURES = ['already exists with different content'];
const CREATE_CONFLICT_ERROR =
  'Session conflict: this ID already exists with different content. Use a new ID or update the existing session.';
const SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_SESSION_ID_LENGTH = 100;

function validateDate(
  dateValue: unknown
): { valid: true; date: string } | { valid: false; error: string } {
  if (typeof dateValue !== 'string') {
    return { valid: false, error: 'Invalid date: expected YYYY-MM-DD format' };
  }

  const match = ISO_DATE_PATTERN.exec(dateValue);
  if (!match) {
    return { valid: false, error: 'Invalid date: expected YYYY-MM-DD format' };
  }

  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return {
      valid: false,
      error: 'Invalid date: must be a real calendar date',
    };
  }

  return { valid: true, date: dateValue };
}

function validateTechniques(
  techniquesValue: unknown
): { valid: true; techniques: string[] } | { valid: false; error: string } {
  if (!Array.isArray(techniquesValue)) {
    return {
      valid: false,
      error: 'Invalid techniques: expected an array of non-empty strings',
    };
  }

  const normalized: string[] = [];

  for (let index = 0; index < techniquesValue.length; index += 1) {
    const technique = techniquesValue[index];
    if (typeof technique !== 'string') {
      return {
        valid: false,
        error: `Invalid techniques[${index}]: expected a string`,
      };
    }

    const trimmed = technique.trim();
    if (!trimmed) {
      return {
        valid: false,
        error: `Invalid techniques[${index}]: value cannot be empty`,
      };
    }

    normalized.push(trimmed);
  }

  return {
    valid: true,
    techniques: [...new Set(normalized)],
  };
}

function validateOptionalString(
  value: unknown,
  fieldName: 'description' | 'notes'
):
  | { valid: true; value: string | undefined }
  | { valid: false; error: string } {
  if (value === undefined) {
    return { valid: true, value: undefined };
  }

  if (typeof value !== 'string') {
    return { valid: false, error: `Invalid ${fieldName}: expected a string` };
  }

  return { valid: true, value };
}

function validateOptionalVideoUrl(
  value: unknown
):
  | { valid: true; videoUrl: string | undefined }
  | { valid: false; error: string } {
  if (value === undefined) {
    return { valid: true, videoUrl: undefined };
  }

  if (typeof value !== 'string') {
    return { valid: false, error: 'Invalid videoUrl: expected a string' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    return {
      valid: false,
      error: 'Invalid videoUrl: expected a valid absolute URL',
    };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Invalid videoUrl: protocol must be http or https',
    };
  }

  if (isBlockedNetworkHostname(parsedUrl.hostname)) {
    return {
      valid: false,
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    };
  }

  return { valid: true, videoUrl: parsedUrl.toString() };
}

function validateDuration(
  value: unknown
):
  | { valid: true; duration: number | undefined }
  | { valid: false; error: string } {
  if (value === undefined) {
    return { valid: true, duration: undefined };
  }

  if (!Number.isInteger(value) || (value as number) < 0) {
    return {
      valid: false,
      error: 'Invalid duration: expected a non-negative integer',
    };
  }

  return { valid: true, duration: value as number };
}

function validateSessionId(
  value: unknown
): { valid: true; id: string } | { valid: false; error: string } {
  if (value === undefined || value === null) {
    return {
      valid: true,
      id: `session-${Date.now()}-${crypto.randomUUID()}`,
    };
  }

  if (typeof value !== 'string') {
    return { valid: false, error: 'Invalid id: expected a string' };
  }

  const trimmedId = value.trim();
  if (!trimmedId) {
    return {
      valid: false,
      error: 'Invalid id: expected a non-empty string',
    };
  }

  if (trimmedId.length > MAX_SESSION_ID_LENGTH) {
    return {
      valid: false,
      error: `Invalid id: exceeds maximum length of ${MAX_SESSION_ID_LENGTH} characters`,
    };
  }

  if (!SAFE_SESSION_ID_PATTERN.test(trimmedId)) {
    return {
      valid: false,
      error:
        'Invalid id: contains invalid characters; only letters, digits, "-" and "_" are allowed',
    };
  }

  return { valid: true, id: trimmedId };
}

/**
 * POST /api/sessions/create
 * Create a new session and save it as a markdown file
 *
 * Request body: Partial JudoSession (id will be generated if not provided) + optional gitHubConfig.
 * If gitHubConfig is omitted, the server uses the user's stored GitHub config (when available).
 * Response: Created JudoSession with id
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse) {
      return user;
    }

    const payload = await request.json();
    if (
      payload === null ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const body = payload;

    const idValidation = validateSessionId(body.id);
    if (!idValidation.valid) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }
    const id = idValidation.id;

    // Validate required fields
    if (!body.date) {
      return NextResponse.json(
        { error: 'Missing required field: date' },
        { status: 400 }
      );
    }

    const dateValidation = validateDate(body.date);
    if (!dateValidation.valid) {
      return NextResponse.json(
        { error: dateValidation.error },
        { status: 400 }
      );
    }

    if (!Number.isInteger(body.effort) || body.effort < 1 || body.effort > 5) {
      return NextResponse.json(
        { error: 'Invalid effort level (must be an integer 1-5)' },
        { status: 400 }
      );
    }

    if (!['Technical', 'Randori', 'Shiai'].includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const techniquesValidation = validateTechniques(body.techniques);
    if (!techniquesValidation.valid) {
      return NextResponse.json(
        { error: techniquesValidation.error },
        { status: 400 }
      );
    }

    const descriptionValidation = validateOptionalString(
      body.description,
      'description'
    );
    if (!descriptionValidation.valid) {
      return NextResponse.json(
        { error: descriptionValidation.error },
        { status: 400 }
      );
    }

    const notesValidation = validateOptionalString(body.notes, 'notes');
    if (!notesValidation.valid) {
      return NextResponse.json(
        { error: notesValidation.error },
        { status: 400 }
      );
    }

    const videoUrlValidation = validateOptionalVideoUrl(body.videoUrl);
    if (!videoUrlValidation.valid) {
      return NextResponse.json(
        { error: videoUrlValidation.error },
        { status: 400 }
      );
    }

    const durationValidation = validateDuration(body.duration);
    if (!durationValidation.valid) {
      return NextResponse.json(
        { error: durationValidation.error },
        { status: 400 }
      );
    }

    const session: JudoSession = {
      id,
      date: dateValidation.date,
      effort: body.effort,
      category: body.category,
      techniques: techniquesValidation.techniques,
      ...(descriptionValidation.value !== undefined && {
        description: descriptionValidation.value,
      }),
      ...(notesValidation.value !== undefined && {
        notes: notesValidation.value,
      }),
      ...(videoUrlValidation.videoUrl !== undefined && {
        videoUrl: videoUrlValidation.videoUrl,
      }),
      ...(durationValidation.duration !== undefined && {
        duration: durationValidation.duration,
      }),
    };

    const requestedGitHubConfig = normalizeGitHubConfig(
      body.gitHubConfig as GitHubConfig | undefined
    );
    const authzResult = await resolveAuthorizedGitHubConfig(
      user.uid,
      requestedGitHubConfig
    );
    if (authzResult.forbiddenResponse) {
      return authzResult.forbiddenResponse;
    }
    const gitHubConfig = authzResult.config;
    if (gitHubConfig && shouldProxyGitHubRequests(gitHubConfig)) {
      return proxyGoFunction(request, {
        path: '/api/go/sessions/create',
        method: 'POST',
        body: buildGitHubSessionBody(session, gitHubConfig),
      });
    }

    await createSessionForConfig(session, gitHubConfig);

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error ?? '');
    const isConflictError = CREATE_CONFLICT_SIGNATURES.some((signature) =>
      errorMessage.toLowerCase().includes(signature.toLowerCase())
    );

    if (isConflictError) {
      return NextResponse.json(
        {
          error: CREATE_CONFLICT_ERROR,
        },
        { status: 409 }
      );
    }

    console.error('Error creating session', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
