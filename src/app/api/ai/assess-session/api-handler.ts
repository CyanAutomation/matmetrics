// Internal handler dispatched by app/api/[...path]/route.ts.
import { createAssessSessionPost } from './handler';

export const maxDuration = 30;
export const POST = createAssessSessionPost();
