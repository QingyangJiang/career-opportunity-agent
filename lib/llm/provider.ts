import type { LLMProvider } from "@/lib/llm/types";
import { MockLLMProvider } from "@/lib/llm/mock-provider";
import { DeepSeekProvider } from "@/lib/llm/deepseek-provider";
import { getCurrentProviderConfig } from "@/lib/llm/config";

export function getLLMProvider(): LLMProvider {
  const config = getCurrentProviderConfig();
  if (config.provider === "deepseek") {
    return new DeepSeekProvider(config);
  }
  return new MockLLMProvider();
}
