export const MEMORY_TYPES = [
  "ProfileFact",
  "Skill",
  "ProjectClaim",
  "Preference",
  "Constraint",
  "CareerGoal",
  "CurrentTask",
  "ComparisonTarget",
  "HistoricalConclusion"
] as const;

export const MEMORY_STATUSES = ["active", "archived", "rejected"] as const;

export const EVIDENCE_TYPES = [
  "jd",
  "recruiter_message",
  "hr_chat",
  "interview_note",
  "offer",
  "resume",
  "project_note",
  "user_note"
] as const;

export const OPPORTUNITY_TYPES = [
  "public_jd",
  "recruiter_lead",
  "referral",
  "ongoing_process",
  "offer",
  "company_watch"
] as const;

export const OPPORTUNITY_STATUSES = [
  "discovered",
  "screening",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "paused"
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export type RiskSeverity = "low" | "medium" | "high";
export type RiskLikelihood = "low" | "medium" | "high" | "unknown";
export type RiskStatus = "active" | "resolved" | "dismissed";
export type OpenQuestionTarget = "hr" | "interviewer" | "recruiter" | "self";
export type QuestionPriority = "low" | "medium" | "high";
export type QuestionStatus = "unasked" | "asked" | "answered";
export type DecisionValue = "pursue" | "maybe" | "reject" | "pause";
export type ConfidenceLabel = "low" | "medium" | "high";
export type MemorySuggestionStatus = "pending" | "accepted" | "rejected";
export type AgentRunStatus = "running" | "completed" | "failed";
export type MatchStrength = "high" | "medium" | "low" | "gap";
export type ChatThreadStatus = "active" | "archived";
export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

export interface MemoryDTO {
  id: string;
  type: MemoryType | string;
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  userVerified: boolean;
  status: MemoryStatus | string;
  sourceEvidenceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryVersionDTO {
  id: string;
  memoryId: string;
  snapshot: Omit<MemoryDTO, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  };
  changeReason: string;
  createdAt: string;
}

export interface EvidenceDTO {
  id: string;
  type: EvidenceType | string;
  title: string;
  content: string;
  sourceUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityDTO {
  id: string;
  type: OpportunityType | string;
  company: string;
  businessUnit?: string | null;
  roleTitle: string;
  sourceChannel?: string | null;
  sourceUrl?: string | null;
  status: OpportunityStatus | string;
  location?: string | null;
  salaryRange?: string | null;
  directionTags: string[];
  responsibilities: string[];
  requirements: string[];
  rawSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityMemoryMatchDTO {
  id: string;
  opportunityId: string;
  memoryId?: string | null;
  requirement: string;
  memoryTitle?: string | null;
  strength: MatchStrength | string;
  rationale: string;
  evidenceIds: string[];
  createdAt: string;
}

export interface AssessmentDTO {
  id: string;
  opportunityId: string;
  overallScore: number;
  directionMatchScore: number;
  experienceMatchScore: number;
  compensationMatchScore: number;
  ownerSpaceScore: number;
  summary: string;
  strongMatches: unknown[];
  weakMatches: unknown[];
  createdAt: string;
}

export interface RiskDTO {
  id: string;
  opportunityId: string;
  title: string;
  description: string;
  severity: RiskSeverity | string;
  likelihood: RiskLikelihood | string;
  mitigation?: string | null;
  status: RiskStatus | string;
  evidenceIds: string[];
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
  sourceAgentRunId?: string | null;
  sourceOpportunityId?: string | null;
  sourceEvidenceId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface OpenQuestionDTO {
  id: string;
  opportunityId: string;
  question: string;
  target: OpenQuestionTarget | string;
  priority: QuestionPriority | string;
  status: QuestionStatus | string;
  answer?: string | null;
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
  sourceAgentRunId?: string | null;
  sourceOpportunityId?: string | null;
  sourceEvidenceId?: string | null;
  createdAt: string;
}

export interface DecisionDTO {
  id: string;
  opportunityId: string;
  decision: DecisionValue | string;
  confidence: ConfidenceLabel | string;
  rationale: string;
  evidenceIds: string[];
  createdAt: string;
}

export interface MemorySuggestionDTO {
  id: string;
  agentRunId: string;
  suggestedType: MemoryType | string;
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  reason: string;
  sourceEvidenceIds: string[];
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
  sourceAgentRunId?: string | null;
  sourceOpportunityId?: string | null;
  sourceEvidenceId?: string | null;
  status: MemorySuggestionStatus | string;
  createdAt: string;
  updatedAt?: string;
  handledAt?: string | null;
}

export interface AgentStepDTO {
  id: string;
  agentRunId: string;
  stepName: string;
  inputSummary: string;
  output: unknown;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
}

export interface AgentRunDTO {
  id: string;
  workflowType: string;
  input: unknown;
  triggerType?: string | null;
  detectedIntent?: string | null;
  actionPlan?: unknown[];
  sourceMessageText?: string | null;
  chatThreadId?: string | null;
  sourceMessageId?: string | null;
  chatThreadTitle?: string | null;
  sourceMessageContent?: string | null;
  status: AgentRunStatus | string;
  createdAt: string;
  updatedAt: string;
  steps?: AgentStepDTO[];
  suggestions?: MemorySuggestionDTO[];
}

export interface ChatContextAttachmentDTO {
  id: string;
  threadId: string;
  entityType: "memory" | "evidence" | "opportunity" | "agent_run" | string;
  entityId: string;
  createdAt: string;
}

export interface ChatMessageDTO {
  id: string;
  threadId: string;
  role: ChatMessageRole | string;
  content: string;
  agentRunId?: string | null;
  metadata?: unknown;
  createdAt: string;
}

export interface ChatThreadDTO {
  id: string;
  title: string;
  summary?: string | null;
  status: ChatThreadStatus | string;
  provider: "mock" | "deepseek" | string;
  model: string;
  providerLabel?: string | null;
  thinking?: "enabled" | "disabled" | string | null;
  reasoningEffort?: "high" | "max" | "none" | string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  messages?: ChatMessageDTO[];
  attachments?: ChatContextAttachmentDTO[];
  pendingCount?: number;
}

export interface OpportunityDetailDTO extends OpportunityDTO {
  evidence: EvidenceDTO[];
  latestAssessment?: AssessmentDTO | null;
  risks: RiskDTO[];
  openQuestions: OpenQuestionDTO[];
  decisions: DecisionDTO[];
  memoryMatches: OpportunityMemoryMatchDTO[];
}
