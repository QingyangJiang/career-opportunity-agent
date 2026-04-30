# Career Agent Evaluation Sample Report

## Provider

- Provider: Mock baseline / DeepSeek target / MiMo planned
- Model: MockLLMProvider baseline; MiMo model TBD after API access
- Date: 2026-04-30

## Summary

| Metric | Result |
|---|---:|
| Hard assertion pass rate | Baseline harness ready |
| Average soft score | Baseline harness ready |
| JSON validity | Structured JSON checks planned for MiMo |
| Memory safety violations | Must remain 0 |
| Opportunity over-creation cases | Must remain 0 for weak JD / ordinary chat |
| Average latency | To be measured after MiMo integration |

## Case Categories

- Ordinary career chat
- Weak JD that should not create an Opportunity
- Complete JD that should create an Opportunity draft
- Explicit memory update
- Temporary thought
- Opportunity comparison
- Interview preparation
- Follow-up resolution
- Resume/project rewriting
- Interview review

## Current Baseline

The repository already includes a career-agent evaluation harness with JSON case files, hard expectations, rule-based soft scoring, failure taxonomy, latency/cost recording, and isolated eval databases.

The Mock provider is used as a deterministic local smoke path. DeepSeek Flash is the current real-model target for optimization. MiMo will be integrated as another real provider and evaluated on the same workflow.

## Planned MiMo Benchmark

MiMo will be evaluated against the same cases after API integration.

The comparison will focus on:

- Chinese long-context career conversation quality
- JD structured extraction accuracy
- Opportunity creation precision
- Memory safety and suggestion quality
- Follow-up resolution for short Chinese prompts such as "除此之外呢"
- Structured JSON validity
- Trace completeness in AgentRun / AgentStep records
- Latency and cost
