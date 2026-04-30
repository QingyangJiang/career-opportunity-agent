import type {
  AgentRunDTO,
  AssessmentDTO,
  DecisionDTO,
  EvidenceDTO,
  MemorySuggestionDTO,
  OpenQuestionDTO,
  OpportunityDTO,
  RiskDTO
} from "@/lib/types";
import type { CareerAgentCitation, CareerAskResponse } from "@/lib/career-agent/ask";

export type CareerAgentMode = "auto" | "ask_only" | "analyze_as_evidence";

export type CareerAgentIntent =
  | "ordinary_chat"
  | "ask_question"
  | "follow_up"
  | "analyze_evidence"
  | "analyze_evidence_candidate"
  | "update_memory"
  | "prepare_interview"
  | "interview_review"
  | "rewrite_resume_project"
  | "rewrite_resume_or_project"
  | "compare_opportunities"
  | "needs_external_source"
  | "invalid_input"
  | "clarify";

export type RouterActionLevel =
  | "answer_only"
  | "answer_with_info_gaps"
  | "suggest_memory_candidate"
  | "show_structured_card"
  | "propose_draft_object"
  | "create_structured_objects";

export type EvidenceSufficiency = "none" | "weak" | "partial" | "sufficient";
export type MemorySignalStrength = "none" | "low" | "medium" | "high";
export type FollowUpType =
  | "expand_previous_answer"
  | "clarify_previous_answer"
  | "compare_with_previous"
  | "ask_for_more_options"
  | "ask_for_next_steps"
  | "ask_about_mentioned_entity"
  | "unknown";

export type RouterEvidenceType =
  | "jd"
  | "recruiter_message"
  | "hr_chat"
  | "interview_note"
  | "offer"
  | "user_note"
  | "none";

export interface RouterClassification {
  intent: CareerAgentIntent;
  followUpType?: FollowUpType;
  actionLevel: RouterActionLevel;
  evidenceSufficiency: EvidenceSufficiency;
  memorySignalStrength: MemorySignalStrength;
  missingFields: string[];
  evidenceType: RouterEvidenceType;
  shouldCreateEvidence: boolean;
  shouldExtractOpportunity: boolean;
  shouldGenerateAssessment: boolean;
  shouldGenerateRisks: boolean;
  shouldGenerateOpenQuestions: boolean;
  shouldGenerateDecision: boolean;
  shouldCreateObjects: boolean;
  shouldSuggestMemoryUpdates: boolean;
  shouldSuggestMemory: boolean;
  shouldShowStructuredCard: boolean;
  shouldShowInfoGaps: boolean;
  confidence: number;
  needsConfirmation: boolean;
  reason: string;
  skippedReason?: string;
  preRouterHints?: PreRouterHints;
  policyGuardCorrections?: string[];
  referencedEntities?: {
    companies: string[];
    roles: string[];
    directions: string[];
    opportunityIds: string[];
  };
  usedRecentMessagesCount?: number;
  usedLastAssistantAnswer?: boolean;
  threadTopicSummary?: string;
  resolvedReference?: string;
  currentInputType?: CurrentInputType;
  groundingTarget?: string;
  blockedArtifacts?: ArtifactType[];
  groundingCheck?: "passed" | "failed" | "regenerated";
  answerPlan?: AnswerPlan;
  artifactActions?: ArtifactAction[];
  commitPolicy?: CommitPolicySummary;
}

export type ConversationIntent =
  | "ordinary_chat"
  | "answer_question"
  | "analyze_job"
  | "compare_options"
  | "prepare_interview"
  | "rewrite_resume"
  | "interview_review"
  | "follow_up"
  | "clarify";

export type ResponseMode = "natural" | "structured_light" | "detailed_analysis";

export type CurrentInputType =
  | "ordinary_chat"
  | "explicit_memory_update"
  | "job_description"
  | "recruiter_message"
  | "interview_prep_request"
  | "interview_review"
  | "resume_project_rewrite"
  | "opportunity_compare"
  | "follow_up"
  | "unknown";

export interface AnswerPlan {
  currentInputType: CurrentInputType;
  conversationIntent: ConversationIntent;
  responseMode: ResponseMode;
  shouldAnswerFirst: true;
  needsContext: boolean;
  referencedEntities: string[];
  confidence: number;
  groundingTarget?: string;
  usedLongTermMemory?: boolean;
  memoryUsedFor?: "none" | "personalization" | "fit_evaluation";
  blockedArtifacts?: ArtifactType[];
  groundingCheck?: "passed" | "failed" | "regenerated";
}

export type ArtifactType =
  | "memory_suggestion"
  | "evidence"
  | "opportunity"
  | "job_analysis"
  | "interview_prep"
  | "interview_note"
  | "decision"
  | "open_question"
  | "risk"
  | "none";

export type WritePolicy = "never_direct" | "pending_confirmation" | "draft" | "auto_low_risk";

export interface ArtifactAction {
  type: ArtifactType;
  confidence: number;
  reason: string;
  requiresUserConfirmation: boolean;
  writePolicy: WritePolicy;
}

export interface CommitPolicySummary {
  memory: "pending_confirmation";
  evidence: "draft" | "none";
  opportunity: "draft" | "none";
  decision: "draft" | "none";
  riskOpenQuestionLimit: number;
}

export interface ConversationContext {
  recentMessages: Array<{ id: string; role: string; content: string; createdAt: string }>;
  lastUserMessage?: string;
  lastAssistantMessage?: string;
  lastAssistantAnswerSummary?: string;
  threadTopicSummary?: string;
  lastDiscussedEntities?: string[];
  activeTaskIntent?: string;
  referencedOpportunities?: string[];
  referencedCompanies?: string[];
  referencedRoles?: string[];
  mentionedDirections?: string[];
}

export interface PreRouterHints {
  hasExplicitMemorySignal: boolean;
  hasFollowUpSignal: boolean;
  hasEvidenceLikeText: boolean;
  hasStrongJDSignal: boolean;
  hasInterviewSignal: boolean;
}

export type RouterAction =
  | "create_evidence"
  | "extract_opportunity"
  | "match_with_memories"
  | "generate_assessment"
  | "generate_risks"
  | "generate_open_questions"
  | "generate_decision"
  | "suggest_memory_updates"
  | "retrieve_context"
  | "answer_question"
  | "show_structured_card"
  | "report_missing_external_source"
  | "ask_clarifying_question";

export interface ExecutedAction {
  action: RouterAction | "classify_input" | "plan_actions" | "compose_response";
  status: "completed" | "skipped" | "failed";
  summary: string;
}

export interface RouterCreatedObjects {
  evidence?: EvidenceDTO;
  opportunity?: OpportunityDTO;
  assessment?: AssessmentDTO | null;
  risks?: RiskDTO[];
  risksCount: number;
  openQuestions?: OpenQuestionDTO[];
  openQuestionsCount: number;
  decision?: DecisionDTO | null;
  memorySuggestions?: MemorySuggestionDTO[];
  memorySuggestionsCount: number;
}

export interface RouterLinks {
  agentRun?: string;
  opportunity?: string;
  memorySuggestions?: string;
}

export interface RouterExecutionResult {
  classification: RouterClassification;
  actionPlan: RouterAction[];
  executedActions: ExecutedAction[];
  answer: string;
  answerSections: CareerAskResponse["sections"];
  createdObjects: RouterCreatedObjects;
  pendingActions: string[];
  links: RouterLinks;
  citations: CareerAgentCitation[];
  agentRun: AgentRunDTO;
}
