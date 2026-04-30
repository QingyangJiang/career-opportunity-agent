import type { ChatThread } from "@prisma/client";
import {
  getDefaultModelConfig,
  normalizeProviderConfig,
  type LLMProviderConfig
} from "@/lib/llm/config";

type ThreadModelFields = Pick<ChatThread, "provider" | "model" | "providerLabel" | "thinking" | "reasoningEffort">;

export function getThreadModelConfig(thread?: Partial<ThreadModelFields> | null): LLMProviderConfig {
  if (!thread?.provider) return getDefaultModelConfig();
  return normalizeProviderConfig({
    provider: thread.provider === "deepseek" ? "deepseek" : "mock",
    model: thread.model ?? undefined,
    providerLabel: thread.providerLabel ?? undefined,
    thinking: thread.thinking === "enabled" ? "enabled" : "disabled",
    reasoningEffort:
      thread.reasoningEffort === "high" || thread.reasoningEffort === "max" || thread.reasoningEffort === "medium" || thread.reasoningEffort === "low"
        ? thread.reasoningEffort
        : "none"
  });
}

export function threadModelData(config?: Partial<LLMProviderConfig> | null) {
  const normalized = normalizeProviderConfig(config);
  return {
    provider: normalized.provider,
    model: normalized.model ?? (normalized.provider === "deepseek" ? "deepseek-v4-flash" : "MockLLMProvider"),
    providerLabel: normalized.providerLabel ?? (normalized.provider === "deepseek" ? "DeepSeek" : "MockLLMProvider"),
    thinking: normalized.thinking ?? "disabled",
    reasoningEffort: normalized.reasoningEffort ?? "none"
  };
}
