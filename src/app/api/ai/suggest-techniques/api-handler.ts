// Internal handler dispatched by app/api/[...path]/route.ts.
import { createSuggestTechniquesPost } from './handler';

export const maxDuration = 30;
export const POST = createSuggestTechniquesPost();
