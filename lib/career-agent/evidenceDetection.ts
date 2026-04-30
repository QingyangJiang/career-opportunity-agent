export function looksLikeEvidenceInput(input: string): boolean {
  const text = input.toLowerCase();
  const keywordHits = [
    "岗位职责",
    "职位描述",
    "任职要求",
    "jd",
    "薪资",
    "base",
    "猎头",
    "内推",
    "面试",
    "offer",
    "招聘",
    "responsibilities",
    "requirements",
    "role"
  ].filter((keyword) => text.includes(keyword.toLowerCase())).length;

  const roleSignalHits = [
    "sft",
    "dpo",
    "grpo",
    "ppo",
    "rlhf",
    "rlvr",
    "reward",
    "verifier",
    "agent",
    "rag"
  ].filter((keyword) => text.includes(keyword)).length;

  return keywordHits >= 2 || (input.length > 120 && keywordHits >= 1 && roleSignalHits >= 2);
}

export function inferEvidenceType(input: string): string {
  const text = input.toLowerCase();
  if (text.includes("offer")) return "offer";
  if (text.includes("面试")) return "interview_note";
  if (text.includes("hr")) return "hr_chat";
  if (text.includes("猎头") || text.includes("recruiter")) return "recruiter_message";
  if (text.includes("岗位职责") || text.includes("任职要求") || text.includes("jd")) return "jd";
  return "user_note";
}

export function titleFromInput(input: string, fallback = "Command Center Evidence") {
  const firstLine = input
    .split(/\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return fallback;
  return firstLine.length > 42 ? `${firstLine.slice(0, 42)}...` : firstLine;
}
