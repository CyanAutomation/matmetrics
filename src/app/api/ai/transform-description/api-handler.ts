// Internal handler dispatched by app/api/[...path]/route.ts.
import { createTransformDescriptionPost } from './handler';

export const maxDuration = 30;
export const POST = createTransformDescriptionPost();
