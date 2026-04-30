import { prisma } from "@/lib/db/prisma";
import type { MemoryDTO, MemoryVersionDTO } from "@/lib/types";
import { normalizeStringArray, parseJson, parseJsonArray, stringifyJson } from "@/lib/utils/json";
import { memorySnapshot, toMemoryDTO, toMemorySuggestionDTO, toMemoryVersionDTO } from "@/lib/memory/serializers";
import { normalizeText } from "@/lib/utils/normalize";

export interface MemoryInput {
  type: string;
  title: string;
  content: string;
  tags?: string[] | string;
  confidence?: number;
  userVerified?: boolean;
  status?: string;
  sourceEvidenceIds?: string[] | string;
}

export interface MemoryFilters {
  search?: string | null;
  type?: string | null;
  tag?: string | null;
  status?: string | null;
}

async function writeVersion(memoryId: string, changeReason: string) {
  const memory = await prisma.memory.findUniqueOrThrow({ where: { id: memoryId } });
  return prisma.memoryVersion.create({
    data: {
      memoryId,
      snapshotJson: stringifyJson(memorySnapshot(memory)),
      changeReason
    }
  });
}

export async function listMemories(filters: MemoryFilters = {}): Promise<MemoryDTO[]> {
  const memories = await prisma.memory.findMany({
    orderBy: [{ type: "asc" }, { updatedAt: "desc" }]
  });

  const search = filters.search?.trim().toLowerCase();
  const tag = filters.tag?.trim().toLowerCase();
  return memories
    .map(toMemoryDTO)
    .filter((memory) => {
      if (filters.status && memory.status !== filters.status) return false;
      if (filters.type && memory.type !== filters.type) return false;
      if (tag && !memory.tags.some((item) => item.toLowerCase().includes(tag))) return false;
      if (!search) return true;
      return [memory.title, memory.content, memory.type, memory.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
}

export async function getMemory(id: string): Promise<MemoryDTO | null> {
  const memory = await prisma.memory.findUnique({ where: { id } });
  return memory ? toMemoryDTO(memory) : null;
}

export async function createMemory(input: MemoryInput, changeReason = "Created memory"): Promise<MemoryDTO> {
  const memory = await prisma.memory.create({
    data: {
      type: input.type,
      title: input.title,
      content: input.content,
      tagsJson: stringifyJson(normalizeStringArray(input.tags)),
      confidence: input.confidence ?? 0.7,
      userVerified: input.userVerified ?? false,
      status: input.status ?? "active",
      sourceEvidenceIdsJson: stringifyJson(normalizeStringArray(input.sourceEvidenceIds))
    }
  });
  await writeVersion(memory.id, changeReason);
  return toMemoryDTO(memory);
}

export async function updateMemory(
  id: string,
  input: Partial<MemoryInput>,
  changeReason = "Updated memory"
): Promise<MemoryDTO> {
  const memory = await prisma.memory.update({
    where: { id },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.tags !== undefined ? { tagsJson: stringifyJson(normalizeStringArray(input.tags)) } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.userVerified !== undefined ? { userVerified: input.userVerified } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.sourceEvidenceIds !== undefined
        ? { sourceEvidenceIdsJson: stringifyJson(normalizeStringArray(input.sourceEvidenceIds)) }
        : {})
    }
  });
  await writeVersion(memory.id, changeReason);
  return toMemoryDTO(memory);
}

export async function archiveMemory(id: string): Promise<MemoryDTO> {
  return updateMemory(id, { status: "archived" }, "Archived memory");
}

export async function deleteMemory(id: string): Promise<void> {
  await prisma.memory.delete({ where: { id } });
}

export async function listMemoryVersions(memoryId: string): Promise<MemoryVersionDTO[]> {
  const versions = await prisma.memoryVersion.findMany({
    where: { memoryId },
    orderBy: { createdAt: "desc" }
  });
  return versions.map(toMemoryVersionDTO);
}

export async function rollbackMemory(memoryId: string, versionId: string): Promise<MemoryDTO> {
  const version = await prisma.memoryVersion.findFirstOrThrow({
    where: { id: versionId, memoryId }
  });
  const snapshot = parseJson<MemoryDTO>(version.snapshotJson, {} as MemoryDTO);

  const updated = await prisma.memory.update({
    where: { id: memoryId },
    data: {
      type: snapshot.type,
      title: snapshot.title,
      content: snapshot.content,
      tagsJson: stringifyJson(snapshot.tags ?? []),
      confidence: snapshot.confidence,
      userVerified: snapshot.userVerified,
      status: snapshot.status,
      sourceEvidenceIdsJson: stringifyJson(snapshot.sourceEvidenceIds ?? [])
    }
  });

  await writeVersion(memoryId, `Rolled back to version ${versionId}`);
  return toMemoryDTO(updated);
}

export async function acceptMemorySuggestion(
  suggestionId: string,
  edits: Partial<MemoryInput> = {}
): Promise<{ memory: MemoryDTO; suggestion: ReturnType<typeof toMemorySuggestionDTO> }> {
  const suggestion = await prisma.memorySuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
  if (suggestion.status !== "pending") {
    throw new Error("MemorySuggestion has already been handled.");
  }

  const memoryInput = {
    type: edits.type ?? suggestion.suggestedType,
    title: edits.title ?? suggestion.title,
    content: edits.content ?? suggestion.content,
    tags: edits.tags ?? parseJsonArray<string>(suggestion.tagsJson),
    confidence: edits.confidence ?? suggestion.confidence,
    userVerified: true,
    status: "active",
    sourceEvidenceIds: edits.sourceEvidenceIds ?? parseJsonArray<string>(suggestion.sourceEvidenceIdsJson)
  };

  const existingMemories = await prisma.memory.findMany({
    where: { type: memoryInput.type, status: "active" }
  });
  const existingMemory = existingMemories.find(
    (memory) =>
      normalizeText(memory.title) === normalizeText(memoryInput.title) &&
      normalizeText(memory.content) === normalizeText(memoryInput.content)
  );

  const memory = existingMemory
    ? toMemoryDTO(existingMemory)
    : await createMemory(memoryInput, `Accepted MemorySuggestion ${suggestionId}`);

  const updatedSuggestion = await prisma.memorySuggestion.update({
    where: { id: suggestionId },
    data: { status: "accepted", handledAt: new Date() }
  });

  return { memory, suggestion: toMemorySuggestionDTO(updatedSuggestion) };
}

export async function rejectMemorySuggestion(suggestionId: string) {
  const suggestion = await prisma.memorySuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
  if (suggestion.status !== "pending") {
    throw new Error("MemorySuggestion has already been handled.");
  }
  const updated = await prisma.memorySuggestion.update({
    where: { id: suggestionId },
    data: { status: "rejected", handledAt: new Date() }
  });
  return toMemorySuggestionDTO(updated);
}
