import { NextRequest, NextResponse } from 'next/server';

import { createContractPayload, toValidationTable } from '@/lib/plugins/api-contract';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json();
    const manifest = body?.manifest;

    if (!manifest) {
      return NextResponse.json(
        {
          error: 'Missing required field: manifest',
          ...createContractPayload({
            unresolvedInputs: ['manifest'],
          }),
        },
        { status: 400 }
      );
    }

    const validationTable = toValidationTable(manifest);

    return NextResponse.json(
      {
        isValid: validationTable.isValid,
        ...createContractPayload({
          validationTable,
          assumptions: [
            'Validation uses src/lib/plugins/validate.ts and default extension-type behavior.',
          ],
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error validating plugin manifest', error);
    return NextResponse.json(
      { error: 'Failed to validate plugin manifest' },
      { status: 500 }
    );
  }
}
