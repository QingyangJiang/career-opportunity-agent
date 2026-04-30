export const classifyCareerInputPrompt = {
  instruction:
    "Please output valid JSON. You are the model-based semantic router for a multi-turn career workflow agent. Use recentMessages and lastAssistantAnswerSummary to resolve follow-ups. Default actionLevel is answer_only. Explicit long-term preference/constraint signals such as 以后, 长期, 优先看, 不考虑, 暂不考虑, 目标, 记住, 硬约束, 筛选标准 must route to update_memory even when the text contains Agentic RL, 后训练, Reward Model, Verifier, or 预训练 direction keywords. Weak JD snippets are analyze_evidence_candidate with answer_with_info_gaps and must not create objects. Complete JD evidence is required before create_structured_objects. Ordinary chat creates no objects. Short follow-ups with usable context must be follow_up, not clarify. Requests to find/search JD without pasted source must be needs_external_source.",
  schemaExample: {
    intent: "ask_question | follow_up | analyze_evidence | update_memory | prepare_interview | interview_review | rewrite_resume_project | compare_opportunities | clarify | needs_external_source",
    followUpType: "expand_previous_answer | clarify_previous_answer | compare_with_previous | ask_for_more_options | ask_for_next_steps | ask_about_mentioned_entity | unknown",
    actionLevel: "answer_only | answer_with_info_gaps | suggest_memory_candidate | show_structured_card | propose_draft_object | create_structured_objects",
    evidenceSufficiency: "none | partial | sufficient",
    memorySignalStrength: "none | low | medium | high",
    evidenceType: "jd | recruiter_message | hr_chat | interview_note | offer | user_note | none",
    confidence: 0,
    needsConfirmation: false,
    reason: "",
    shouldCreateEvidence: false,
    shouldExtractOpportunity: false,
    shouldGenerateAssessment: false,
    shouldGenerateRisks: false,
    shouldGenerateOpenQuestions: false,
    shouldGenerateDecision: false,
    shouldSuggestMemoryUpdates: false,
    shouldSuggestMemory: false,
    shouldShowInfoGaps: false,
    shouldShowStructuredCard: false,
    shouldCreateObjects: false,
    skippedReason: ""
  }
};

export const analyzeEvidencePrompt = {
  instruction:
    "Please output valid JSON. Extract career evidence, opportunity, assessment, risks, open questions, decision, memory suggestions, and a concise answer. Risk/OpenQuestion/Decision must not be MemorySuggestion.",
  schemaExample: {
    evidence: { title: "", type: "jd", summary: "" },
    opportunity: { title: "", company: "", role: "", salary: "", tags: [], stage: "discovered" },
    assessment: { score: 0, summary: "", matchReasons: [], mismatchReasons: [] },
    risks: [{ title: "", severity: "medium", description: "", mitigation: "" }],
    openQuestions: [{ question: "", target: "hr", priority: "medium", reason: "" }],
    decision: { value: "pursue | pause | reject | unknown", confidence: 0, rationale: "" },
    memorySuggestions: [{ suggestedType: "Preference", title: "", content: "", confidence: 0, reason: "" }],
    answer: { conclusion: "", basis: [], risks: [], nextActions: [] }
  }
};

export const updateMemoryPrompt = {
  instruction:
    "Please output valid JSON. Generate pending MemorySuggestion drafts only. Never create confirmed Memory directly.",
  schemaExample: {
    memorySuggestions: [{ suggestedType: "Preference", title: "", content: "", confidence: 0, reason: "" }]
  }
};
