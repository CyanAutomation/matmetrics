import type {
  PluginMaturityCategory,
  PluginMaturityEvidenceSource,
} from './types';

/**
 * Accumulates evidence, scores, and metadata during plugin maturity scoring.
 * Centralizes state mutations to improve traceability and testability.
 */
export class EvidenceAccumulator {
  private categoryScores: Record<PluginMaturityCategory, number> = {
    contract_metadata: 0,
    runtime_integration: 0,
    feature_quality: 0,
    test_coverage: 0,
    operability_docs: 0,
  };
  private evidence: Record<PluginMaturityCategory, string[]> = {
    contract_metadata: [],
    runtime_integration: [],
    feature_quality: [],
    test_coverage: [],
    operability_docs: [],
  };
  private reasons: Record<PluginMaturityCategory, string> = {
    contract_metadata: '',
    runtime_integration: '',
    feature_quality: '',
    test_coverage: '',
    operability_docs: '',
  };
  private nextActions: string[] = [];

  /**
   * Add a score for a specific category
   */
  addCategoryScore(
    category: PluginMaturityCategory,
    score: number,
    _source: PluginMaturityEvidenceSource
  ): void {
    this.categoryScores[category] = score;
  }

  /**
   * Add evidence supporting a category score
   */
  addEvidence(
    category: PluginMaturityCategory,
    _source: PluginMaturityEvidenceSource,
    detail: string
  ): void {
    if (!this.evidence[category]) {
      this.evidence[category] = [];
    }
    this.evidence[category].push(detail);
  }

  /**
   * Set or update the reason for a category score
   */
  addReason(category: PluginMaturityCategory, reason: string): void {
    this.reasons[category] = reason;
  }

  /**
   * Add a next action step
   */
  addNextAction(action: string): void {
    if (!this.nextActions.includes(action)) {
      this.nextActions.push(action);
    }
  }

  /**
   * Get current category scores
   */
  getCategoryScores(): Record<PluginMaturityCategory, number> {
    return { ...this.categoryScores };
  }

  /**
   * Get current evidence entries
   */
  getEvidence(): Record<PluginMaturityCategory, string[]> {
    const result: Record<PluginMaturityCategory, string[]> = {};
    for (const category in this.evidence) {
      result[category as PluginMaturityCategory] = [...this.evidence[category as PluginMaturityCategory]];
    }
    return result;
  }

  /**
   * Get current reasons
   */
  getReasons(): Record<PluginMaturityCategory, string> {
    return { ...this.reasons };
  }

  /**
   * Get next action items
   */
  getNextActions(): string[] {
    return [...this.nextActions];
  }

  /**
   * Calculate total score from all category scores
   */
  getTotalScore(): number {
    return Object.values(this.categoryScores).reduce((sum, score) => sum + score, 0);
  }

  /**
   * Get final summary including all accumulated state
   */
  getFinal(): {
    categoryScores: Record<PluginMaturityCategory, number>;
    totalScore: number;
    evidence: Record<PluginMaturityCategory, string[]>;
    reasons: Record<PluginMaturityCategory, string>;
    nextActions: string[];
  } {
    return {
      categoryScores: this.getCategoryScores(),
      totalScore: this.getTotalScore(),
      evidence: this.getEvidence(),
      reasons: this.getReasons(),
      nextActions: this.getNextActions(),
    };
  }
}
