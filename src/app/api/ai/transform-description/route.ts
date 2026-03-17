import { NextRequest, NextResponse } from 'next/server';
import { transformPracticeDescription } from '@/ai/flows/practice-description-transformer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (typeof body?.description !== 'string' || body.description.trim() === '') {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    const result = await transformPracticeDescription({
      description: body.description.trim(),
      customPrompt:
        typeof body?.customPrompt === 'string' && body.customPrompt.trim()
          ? body.customPrompt
          : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error transforming description', error);
    return NextResponse.json(
      { error: 'Failed to transform description' },
      { status: 500 }
    );
  }
}
