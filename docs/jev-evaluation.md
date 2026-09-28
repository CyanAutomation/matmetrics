# Evaluating JEV thresholds

MatMetrics uses JEV decisions to suggest a session type, assess whether a log has useful category-relevant detail, flag clear conflicts between written effort and the selected effort rating, identify fatigue or injury mentions, review saved technique tags against the session text, and check transformed prose for unsupported details. The current category confidence (`0.8`), category-fit probability (`0.8`), technique-verification probability (`0.9`), useful-detail probability (`0.5`), effort-conflict probability (`0.8`), injury probability (`0.5`), fatigue score (`1`), and transformation-fidelity probability (`0.5`) cutoffs are provisional. Evaluate them on representative, human-labeled examples before changing them or expanding their use.

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

For Choice questions without category-fit scores, each confidence threshold reports:

- `accepted`: predictions at or above the threshold
- `accuracy`: the share of accepted predictions that match the reviewer label
- `coverage`: the share of all examples accepted at that threshold

For Noul questions, the output reports accepted count, precision, recall, and coverage. Precision helps measure false-positive tags; recall shows how many reviewer-positive candidates remain above the cutoff.

For Score questions, the output reports the same binary metrics after applying each score cutoff. For category outcomes that include `categoryFitProbability` on every row, the evaluator reports a grid of confidence and category-fit cutoffs. A row is accepted only when both cutoffs pass. The default grid uses `0.5`, `0.6`, `0.7`, `0.8`, and `0.9` for both axes. To compare a smaller or different grid, include `confidenceThresholds` and/or `categoryFitThresholds` arrays in the JSON input. For example:

```json
{
  "kind": "choice",
  "confidenceThresholds": [0.7, 0.8, 0.9],
  "categoryFitThresholds": [0.6, 0.8, 0.9],
  "outcomes": [
    {
      "resolvedModel": "typesafe/jev-1.13-20260917",
      "predictedCategory": "Technical",
      "actualCategory": "Technical",
      "confidence": 0.91,
      "categoryFitProbability": 0.94
    }
  ]
}
```

The output includes both cutoffs, accepted count, accuracy, and coverage for every pair. Older category files without fit probabilities continue to evaluate confidence alone.

Choose a threshold based on the tradeoff between accepted accuracy and coverage. The tool reports evaluation metrics; it does not choose or update a production threshold automatically.
