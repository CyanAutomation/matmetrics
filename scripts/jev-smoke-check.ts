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
    });

    console.log(
      JSON.stringify({
        ok: true,
        resolvedModel: assessment.resolvedModel,
        suggestedCategory: assessment.suggestedCategory,
        categoryConfidence: assessment.categoryConfidence,
        categoryFitProbability: assessment.categoryFitProbability,
        hasTechniqueDetail: assessment.hasTechniqueDetail,
        hasReflection: assessment.hasReflection,
        fatigueSignal: assessment.fatigueSignal,
        injurySignal: assessment.injurySignal,
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
