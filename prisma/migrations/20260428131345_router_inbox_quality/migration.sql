-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowType" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "triggerType" TEXT,
    "detectedIntent" TEXT,
    "actionPlanJson" TEXT NOT NULL DEFAULT '[]',
    "sourceMessageText" TEXT,
    "sourceMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AgentRun" ("createdAt", "id", "inputJson", "status", "updatedAt", "workflowType") SELECT "createdAt", "id", "inputJson", "status", "updatedAt", "workflowType" FROM "AgentRun";
DROP TABLE "AgentRun";
ALTER TABLE "new_AgentRun" RENAME TO "AgentRun";
CREATE TABLE "new_Decision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidenceIdsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Decision_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Decision" ("confidence", "createdAt", "decision", "evidenceIdsJson", "id", "opportunityId", "rationale") SELECT "confidence", "createdAt", "decision", "evidenceIdsJson", "id", "opportunityId", "rationale" FROM "Decision";
DROP TABLE "Decision";
ALTER TABLE "new_Decision" RENAME TO "Decision";
CREATE TABLE "new_MemorySuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentRunId" TEXT NOT NULL,
    "suggestedType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "confidence" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceEvidenceIdsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" DATETIME,
    CONSTRAINT "MemorySuggestion_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MemorySuggestion" ("agentRunId", "confidence", "content", "createdAt", "handledAt", "id", "reason", "sourceEvidenceIdsJson", "status", "suggestedType", "tagsJson", "title") SELECT "agentRunId", "confidence", "content", "createdAt", "handledAt", "id", "reason", "sourceEvidenceIdsJson", "status", "suggestedType", "tagsJson", "title" FROM "MemorySuggestion";
DROP TABLE "MemorySuggestion";
ALTER TABLE "new_MemorySuggestion" RENAME TO "MemorySuggestion";
CREATE TABLE "new_OpenQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unasked',
    "answer" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpenQuestion_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OpenQuestion" ("answer", "createdAt", "id", "opportunityId", "priority", "question", "status", "target") SELECT "answer", "createdAt", "id", "opportunityId", "priority", "question", "status", "target" FROM "OpenQuestion";
DROP TABLE "OpenQuestion";
ALTER TABLE "new_OpenQuestion" RENAME TO "OpenQuestion";
CREATE TABLE "new_Risk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "likelihood" TEXT NOT NULL,
    "mitigation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "evidenceIdsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Risk_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Risk" ("createdAt", "description", "evidenceIdsJson", "id", "likelihood", "mitigation", "opportunityId", "severity", "title") SELECT "createdAt", "description", "evidenceIdsJson", "id", "likelihood", "mitigation", "opportunityId", "severity", "title" FROM "Risk";
DROP TABLE "Risk";
ALTER TABLE "new_Risk" RENAME TO "Risk";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
