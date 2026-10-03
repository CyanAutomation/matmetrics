'use client';

import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/react';
import { jwtClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [passkeyClient(), jwtClient()],
});
