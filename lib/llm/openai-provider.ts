import type { EvidenceDTO, MemoryDTO } from "@/lib/types";
import type {
  AssessmentDraft,
  DecisionDraft,
  EvidenceClassification,
  LLMProvider,
  MatchResult,
  MemorySuggestionDraft,
  OpenQuestionDraft,
  OpportunityDraft,
  RiskDraft,
  RoleSignals
} from "@/lib/llm/types";
import { MockLLMProvider } from "@/lib/llm/mock-provider";

export class OpenAIProvider implements LLMProvider {
  private readonly fallback = new MockLLMProvider();
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = process.env.OPENAI_MODEL || "gpt-4.1-mini") {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async completeJson<T>(task: string, payload: unknown, fallback: () => Promise<T>): Promise<T> {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          input: [
            {
              role: "system",
              content:
                "You are a career memory analysis engine. Return strict JSON only. Do not write long prose outside JSON."
            },
            {
              role: "user",
              content: JSON.stringify({ task, payload })
            }
          ],
          text: {
            format: { type: "json_object" }
          }
        })
      });

      if (!response.ok) {
        return fallback();
      }

      const data = (await response.json()) as { output_text?: string };
      if (!data.output_text) return fallback();
      return JSON.parse(data.output_text) as T;
    } catch {
      return fallback();
    }
  }

  classifyEvidence(evidence: EvidenceDTO): Promise<EvidenceClassification> {
    return this.completeJson("classifyEvidence", evidence, () => this.fallback.classifyEvidence(evidence));
  }

  extractOpportunity(evidence: EvidenceDTO): Promise<OpportunityDraft> {
    return this.completeJson("extractOpportunity", evidence, () => this.fallback.extractOpportunity(evidence));
  }

  extractRoleSignals(evidence: EvidenceDTO, opportunity: OpportunityDraft): Promise<RoleSignals> {
    return this.completeJson("extractRoleSignals", { evidence, opportunity }, () =>
      this.fallback.extractRoleSignals(evidence, opportunity)
    );
  }

  matchOpportunityWithMemories(opportunity: OpportunityDraft, memories: MemoryDTO[]): Promise<MatchResult> {
    return this.completeJson("matchOpportunityWithMemories", { opportunity, memories }, () =>
      this.fallback.matchOpportunityWithMemories(opportunity, memories)
    );
  }

  generateAssessment(
    opportunity: OpportunityDraft,
    memories: MemoryDTO[],
    matchResult: MatchResult
  ): Promise<AssessmentDraft> {
    return this.completeJson("generateAssessment", { opportunity, memories, matchResult }, () =>
      this.fallback.generateAssessment(opportunity, memories, matchResult)
    );
  }

  generateRisks(
    opportunity: OpportunityDraft,
    memories: MemoryDTO[],
    assessment: AssessmentDraft
  ): Promise<RiskDraft[]> {
    return this.completeJson("generateRisks", { opportunity, memories, assessment }, () =>
      this.fallback.generateRisks(opportunity, memories, assessment)
    );
  }

  generateOpenQuestions(opportunity: OpportunityDraft, risks: RiskDraft[]): Promise<OpenQuestionDraft[]> {
    return this.completeJson("generateOpenQuestions", { opportunity, risks }, () =>
      this.fallback.generateOpenQuestions(opportunity, risks)
    );
  }

  generateDecision(
    opportunity: OpportunityDraft,
    assessment: AssessmentDraft,
    risks: RiskDraft[]
  ): Promise<DecisionDraft> {
    return this.completeJson("generateDecision", { opportunity, assessment, risks }, () =>
      this.fallback.generateDecision(opportunity, assessment, risks)
    );
  }

  suggestMemoryUpdates(
    evidence: EvidenceDTO,
    opportunity: OpportunityDraft,
    assessment: AssessmentDraft
  ): Promise<MemorySuggestionDraft[]> {
    return this.completeJson("suggestMemoryUpdates", { evidence, opportunity, assessment }, () =>
      this.fallback.suggestMemoryUpdates(evidence, opportunity, assessment)
    );
  }
}
