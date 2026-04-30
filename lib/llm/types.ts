import type {
  ConfidenceLabel,
  DecisionValue,
  EvidenceDTO,
  MatchStrength,
  MemoryDTO,
  MemoryType,
  OpenQuestionTarget,
  QuestionPriority,
  RiskLikelihood,
  RiskSeverity
} from "@/lib/types";

export interface EvidenceClassification {
  evidenceType: string;
  confidence: number;
  signals: string[];
}

export interface OpportunityDraft {
  type: string;
  company: string;
  businessUnit?: string | null;
  roleTitle: string;
  sourceChannel?: string | null;
  sourceUrl?: string | null;
  status: string;
  location?: string | null;
  salaryRange?: string | null;
  directionTags: string[];
  responsibilities: string[];
  requirements: string[];
  rawSummary: string;
}

export interface RoleSignals {
  directionTags: string[];
  senioritySignals: string[];
  compensationSignals: string[];
  ownerSpaceSignals: string[];
  missingSignals: string[];
}

export interface MemoryMatchDraft {
  requirement: string;
  memoryId?: string | null;
  memoryTitle?: string | null;
  strength: MatchStrength;
  rationale: string;
  evidenceIds: string[];
}

export interface MatchResult {
  matches: MemoryMatchDraft[];
  matchedMemoryIds: string[];
  coverageScore: number;
  gapSignals: string[];
}

export interface AssessmentDraft {
  overallScore: number;
  directionMatchScore: number;
  experienceMatchScore: number;
  compensationMatchScore: number;
  ownerSpaceScore: number;
  summary: string;
  strongMatches: Array<Record<string, unknown>>;
  weakMatches: Array<Record<string, unknown>>;
}

export interface RiskDraft {
  title: string;
  description: string;
  severity: RiskSeverity;
  likelihood: RiskLikelihood;
  mitigation?: string | null;
  evidenceIds: string[];
}

export interface OpenQuestionDraft {
  question: string;
  target: OpenQuestionTarget;
  priority: QuestionPriority;
  status: "unasked";
  answer?: string | null;
}

export interface DecisionDraft {
  decision: DecisionValue;
  confidence: ConfidenceLabel;
  rationale: string;
  evidenceIds: string[];
}

export interface MemorySuggestionDraft {
  suggestedType: MemoryType;
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  reason: string;
  sourceEvidenceIds: string[];
}

export interface ProviderUsageMetadata {
  apiLatencyMs?: number;
  tokenUsage?: unknown;
  reasoningContentPresent?: boolean;
  error?: string;
}

export interface CareerInputClassificationDraft {
  intent: string;
  followUpType?: string;
  actionLevel?: string;
  evidenceSufficiency?: string;
  memorySignalStrength?: string;
  missingFields?: string[];
  evidenceType: string;
  confidence: number;
  needsConfirmation: boolean;
  reason: string;
  shouldCreateObjects?: boolean;
  shouldCreateEvidence: boolean;
  shouldExtractOpportunity: boolean;
  shouldGenerateAssessment: boolean;
  shouldGenerateRisks: boolean;
  shouldGenerateOpenQuestions: boolean;
  shouldGenerateDecision: boolean;
  shouldSuggestMemoryUpdates: boolean;
  shouldSuggestMemory?: boolean;
  shouldShowStructuredCard?: boolean;
  shouldShowInfoGaps?: boolean;
  skippedReason?: string;
}

export interface LLMProvider {
  metadata?: ProviderUsageMetadata;
  chat?(input: string, context?: unknown): Promise<string>;
  classifyCareerInput?(input: string, context?: unknown): Promise<CareerInputClassificationDraft>;
  answerCareerQuestion?(input: string, context?: unknown): Promise<string>;
  classifyEvidence(evidence: EvidenceDTO): Promise<EvidenceClassification>;
  extractOpportunity(evidence: EvidenceDTO): Promise<OpportunityDraft>;
  extractRoleSignals(evidence: EvidenceDTO, opportunity: OpportunityDraft): Promise<RoleSignals>;
  matchOpportunityWithMemories(opportunity: OpportunityDraft, memories: MemoryDTO[]): Promise<MatchResult>;
  generateAssessment(
    opportunity: OpportunityDraft,
    memories: MemoryDTO[],
    matchResult: MatchResult
  ): Promise<AssessmentDraft>;
  generateRisks(
    opportunity: OpportunityDraft,
    memories: MemoryDTO[],
    assessment: AssessmentDraft
  ): Promise<RiskDraft[]>;
  generateOpenQuestions(opportunity: OpportunityDraft, risks: RiskDraft[]): Promise<OpenQuestionDraft[]>;
  generateDecision(
    opportunity: OpportunityDraft,
    assessment: AssessmentDraft,
    risks: RiskDraft[]
  ): Promise<DecisionDraft>;
  suggestMemoryUpdates(
    evidence: EvidenceDTO,
    opportunity: OpportunityDraft,
    assessment: AssessmentDraft
  ): Promise<MemorySuggestionDraft[]>;
}
