import {
  classifyAiError,
  getAiErrorProviderStatus,
} from '../src/lib/ai-api-error';
import { assessSessionWithJev } from '../src/lib/jev-client';

async function runJevSmokeCheck(): Promise<void> {
  try {
    const assessment = await assessSessionWithJev({
      description:
        'Technical judo drilling with uchi mata entries and controlled movement.',
      notes: 'Synthetic smoke-check input.',
      category: 'Technical',
    });

    console.log(
      JSON.stringify({
        ok: true,
        suggestedCategory: assessment.suggestedCategory,
        categoryConfidence: assessment.categoryConfidence,
      })
    );
  } catch (error) {
    const providerStatus = getAiErrorProviderStatus(error);
    console.error(
      JSON.stringify({
        ok: false,
        code: classifyAiError(error),
        ...(providerStatus === undefined ? {} : { providerStatus }),
      })
    );
    process.exitCode = 1;
  }
}

void runJevSmokeCheck();
