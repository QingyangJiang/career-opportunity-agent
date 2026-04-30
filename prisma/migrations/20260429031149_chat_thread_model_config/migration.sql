-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "model" TEXT NOT NULL DEFAULT 'MockLLMProvider',
    "providerLabel" TEXT,
    "thinking" TEXT NOT NULL DEFAULT 'disabled',
    "reasoningEffort" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ChatThread" ("createdAt", "id", "lastMessageAt", "status", "summary", "title", "updatedAt") SELECT "createdAt", "id", "lastMessageAt", "status", "summary", "title", "updatedAt" FROM "ChatThread";
DROP TABLE "ChatThread";
ALTER TABLE "new_ChatThread" RENAME TO "ChatThread";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
