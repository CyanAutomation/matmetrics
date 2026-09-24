# Evaluating JEV thresholds

MatMetrics uses JEV decisions to suggest a session type, identify missing note details, flag fatigue or injury mentions, verify technique tags, and check transformed prose for unsupported details. The current category confidence (`0.8`), category-fit probability (`0.8`), technique-verification probability (`0.9`), note/injury probability (`0.5`), fatigue score (`1`), and transformation-fidelity probability (`0.5`) cutoffs are provisional. Evaluate them on representative, human-labeled examples before changing them or expanding their use.

## Prepare labeled outcomes

Collect predictions from one resolved JEV model version. For a Choice question, record the suggested category, its confidence, the probability that a supported category fits, and the category a reviewer considers correct. For a Noul question, record the returned probability and whether a reviewer considers the proposition true. For a Score question, record the returned score and whether a reviewer considers the fatigue signal high enough to warrant the nudge. Do not include descriptions, notes, names, or other session text in this evaluation file.

```json
{
  "kind": "choice",
  "outcomes": [
    {
      "resolvedModel": "typesafe/jev-1.13-20260917",
      "predictedCategory": "Technical",
      "actualCategory": "Technical",
      "confidence": 0.91,
      "categoryFitProbability": 0.94
    },
    {
      "resolvedModel": "typesafe/jev-1.13-20260917",
      "predictedCategory": "Randori",
      "actualCategory": "Technical",
      "confidence": 0.62,
      "categoryFitProbability": 0.87
    }
  ]
}
```

For a Noul question such as category fit or technique verification, use `"kind": "noul"` and rows shaped like `{"resolvedModel":"typesafe/jev-1.13-20260917","probability":0.96,"actual":true}`. For fatigue, use `"kind": "score"` and rows shaped like `{"resolvedModel":"typesafe/jev-1.13-20260917","score":1.2,"actual":true}`. `actual` records the reviewer’s binary decision for the behavior being gated. Keep the JSON file outside the repository if it contains private evaluation records. The evaluator rejects files with mixed or partially recorded model versions.

## Compare thresholds

Run the evaluator with the path to the labeled JSON file:

```bash
npm run jev:evaluate-thresholds -- /path/to/labeled-predictions.json
```

For Choice questions, each threshold reports:

- `accepted`: predictions at or above the threshold
- `accuracy`: the share of accepted predictions that match the reviewer label
- `coverage`: the share of all examples accepted at that threshold

For Noul questions, the output reports accepted count, precision, recall, and coverage. Precision helps measure false-positive tags; recall shows how many reviewer-positive candidates remain above the cutoff.

For Score questions, the output reports the same binary metrics after applying each score cutoff. For category outcomes that include `categoryFitProbability` on every row, a row is counted as accepted only when both the Choice confidence cutoff and the current category-fit cutoff pass. Older category files without this field continue to evaluate confidence alone.

Choose a threshold based on the tradeoff between accepted accuracy and coverage. The tool reports evaluation metrics; it does not choose or update a production threshold automatically.
