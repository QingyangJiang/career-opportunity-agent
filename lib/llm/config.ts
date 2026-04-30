import { AsyncLocalStorage } from "node:async_hooks";

export type LLMProviderId = "mock" | "deepseek";
export type DeepSeekThinking = "enabled" | "disabled";
export type DeepSeekReasoningEffort = "high" | "max" | "medium" | "low";

export interface LLMProviderConfig {
  provider: LLMProviderId;
  model?: string;
  providerLabel?: string | null;
  thinking?: DeepSeekThinking;
  reasoningEffort?: DeepSeekReasoningEffort | "none";
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  stream?: boolean;
}

const providerStorage = new AsyncLocalStorage<LLMProviderConfig>();

export const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
export const DEEPSEEK_DEFAULT_MODEL = process.env.DEEPSEEK_DEFAULT_MODEL?.trim() || "deepseek-v4-flash";
export const DEEPSEEK_REASONING_MODEL = process.env.DEEPSEEK_REASONING_MODEL?.trim() || "deepseek-v4-pro";
export const DEEPSEEK_DEFAULT_THINKING = (process.env.DEEPSEEK_THINKING?.trim() || "disabled") as DeepSeekThinking;
export const DEEPSEEK_DEFAULT_REASONING_EFFORT =
  (process.env.DEEPSEEK_REASONING_EFFORT?.trim() || "high") as DeepSeekReasoningEffort;

export function normalizeProviderConfig(input?: Partial<LLMProviderConfig> | null): LLMProviderConfig {
  if (!input || input.provider !== "deepseek") {
    return { provider: "mock", model: "MockLLMProvider", providerLabel: "MockLLMProvider", thinking: "disabled", reasoningEffort: "none" };
  }

  const thinking = input.thinking ?? DEEPSEEK_DEFAULT_THINKING;
  return {
    provider: "deepseek",
    model: input.model?.trim() || (thinking === "enabled" ? DEEPSEEK_REASONING_MODEL : DEEPSEEK_DEFAULT_MODEL),
    providerLabel: input.providerLabel ?? "DeepSeek",
    thinking,
    reasoningEffort: input.reasoningEffort ?? (thinking === "enabled" ? DEEPSEEK_DEFAULT_REASONING_EFFORT : "none"),
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    timeoutMs: input.timeoutMs,
    stream: input.stream
  };
}

export function getCurrentProviderConfig(): LLMProviderConfig {
  return providerStorage.getStore() ?? getDefaultModelConfig();
}

export function withProviderConfig<T>(config: LLMProviderConfig, callback: () => Promise<T>) {
  return providerStorage.run(normalizeProviderConfig(config), callback);
}

export function isDeepSeekConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

export function getDefaultModelConfig(): LLMProviderConfig {
  return { provider: "mock", model: "MockLLMProvider", providerLabel: "MockLLMProvider", thinking: "disabled", reasoningEffort: "none" };
}

export function providerMetadata(config = getCurrentProviderConfig()) {
  return {
    provider: config.provider,
    model: config.model ?? (config.provider === "deepseek" ? DEEPSEEK_DEFAULT_MODEL : "MockLLMProvider"),
    providerLabel: config.providerLabel ?? (config.provider === "deepseek" ? "DeepSeek" : "MockLLMProvider"),
    thinking: config.thinking ?? "disabled",
    reasoningEffort: config.reasoningEffort ?? null,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    timeoutMs: config.timeoutMs,
    stream: config.stream
  };
}
