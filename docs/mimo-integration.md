# Xiaomi MiMo Integration Plan

## Why MiMo

Career Memory Agent is a Chinese-first, chat-first career agent. It requires strong capabilities in:

- Long-context Chinese conversation
- Job description understanding
- Structured JSON extraction
- Multi-turn follow-up resolution
- Memory suggestion generation
- Interview preparation
- Agent workflow planning

Xiaomi MiMo will be integrated as one of the real LLM providers and evaluated in the same workflow as existing providers.

## Planned Provider Interface

MiMo will be added through the existing provider boundary:

- `MiMoProvider`
- OpenAI-compatible chat completion interface if supported
- Provider selector support in UI
- Per-run provider/model metadata in AgentRun
- JSON mode for structured tasks
- Graceful failure handling when API key is missing

## Environment Variables

```bash
MIMO_API_KEY=""
MIMO_BASE_URL=""
MIMO_DEFAULT_MODEL=""
```

## Evaluation Tasks

MiMo will be evaluated on:

1. Ordinary career chat
2. Weak JD input that should not create an Opportunity
3. Complete JD input that should create an Opportunity draft
4. Explicit memory update
5. Temporary thought that should not become long-term memory
6. Opportunity comparison
7. Interview preparation
8. Follow-up resolution such as "除此之外呢"
9. Resume/project rewriting
10. Interview review and next-step planning

## Success Metrics

- Hard assertion pass rate
- Structured JSON validity
- Memory safety
- Opportunity creation precision
- Answer relevance
- Naturalness
- Info-gap handling
- Trace completeness
- Latency and cost
