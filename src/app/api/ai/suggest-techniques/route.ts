import { NextRequest, NextResponse } from 'next/server';
import { suggestTechniqueTags } from '@/ai/flows/ai-technique-suggester';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json();

    if (typeof body?.description !== 'string' || body.description.trim() === '') {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    const suggestions = await suggestTechniqueTags({
      description: body.description.trim(),
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error suggesting techniques', error);
    return NextResponse.json(
      { error: 'Failed to suggest techniques' },
      { status: 500 }
    );
  }
}
