import type { Memory, MemorySuggestion, MemoryVersion } from "@prisma/client";
import type { MemoryDTO, MemorySuggestionDTO, MemoryVersionDTO } from "@/lib/types";
import { parseJson, parseJsonArray } from "@/lib/utils/json";

export function toMemoryDTO(memory: Memory): MemoryDTO {
  return {
    id: memory.id,
    type: memory.type,
    title: memory.title,
    content: memory.content,
    tags: parseJsonArray<string>(memory.tagsJson),
    confidence: memory.confidence,
    userVerified: memory.userVerified,
    status: memory.status,
    sourceEvidenceIds: parseJsonArray<string>(memory.sourceEvidenceIdsJson),
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString()
  };
}

export function memorySnapshot(memory: Memory): MemoryDTO {
  return toMemoryDTO(memory);
}

export function toMemoryVersionDTO(version: MemoryVersion): MemoryVersionDTO {
  return {
    id: version.id,
    memoryId: version.memoryId,
    snapshot: parseJson<MemoryVersionDTO["snapshot"]>(version.snapshotJson, {} as MemoryVersionDTO["snapshot"]),
    changeReason: version.changeReason,
    createdAt: version.createdAt.toISOString()
  };
}

export function toMemorySuggestionDTO(suggestion: MemorySuggestion): MemorySuggestionDTO {
  const firstEvidenceId = parseJsonArray<string>(suggestion.sourceEvidenceIdsJson)[0] ?? null;
  return {
    id: suggestion.id,
    agentRunId: suggestion.agentRunId,
    suggestedType: suggestion.suggestedType,
    title: suggestion.title,
    content: suggestion.content,
    tags: parseJsonArray<string>(suggestion.tagsJson),
    confidence: suggestion.confidence,
    reason: suggestion.reason,
    sourceEvidenceIds: parseJsonArray<string>(suggestion.sourceEvidenceIdsJson),
    sourceAgentRunId: suggestion.agentRunId,
    sourceEvidenceId: firstEvidenceId,
    status: suggestion.status,
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt?.toISOString?.() ?? suggestion.createdAt.toISOString(),
    handledAt: suggestion.handledAt?.toISOString() ?? null
  };
}
