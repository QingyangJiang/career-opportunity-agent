import { prisma } from "@/lib/db/prisma";
import { createEvidence } from "@/lib/evidence/service";
import { createMemory } from "@/lib/memory/service";

async function main() {
  await prisma.memoryVersion.deleteMany();
  await prisma.opportunityMemoryMatch.deleteMany();
  await prisma.memorySuggestion.deleteMany();
  await prisma.agentStep.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.openQuestion.deleteMany();
  await prisma.risk.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.opportunityEvidence.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.memory.deleteMany();

  const jd = await createEvidence({
    type: "jd",
    title: "大模型 Agent 后训练算法专家 JD",
    content:
      "岗位职责包括 Agent 场景下的 SFT、DPO、GRPO、RLHF/RLVR 训练；构建多轮工具调用任务的评测与数据闭环；设计 Reward Model、Verifier、LLM-as-a-Judge；优化真实业务 Agent 的任务完成率、工具调用成功率、事实一致性和用户满意度。要求熟悉 PPO/GRPO/DPO，有大模型应用落地经验，熟悉 Agent 工具调用、RAG、多轮对话。薪资 60k-90k，15 薪。"
  });

  await createMemory(
    {
      type: "ProfileFact",
      title: "当前职业背景",
      content: "当前在科大讯飞，做大模型应用与后训练，偏教育/K12/学习机业务落地。",
      tags: ["科大讯飞", "大模型应用", "后训练", "教育", "K12"],
      confidence: 0.95,
      userVerified: true,
      sourceEvidenceIds: []
    },
    "Seed demo profile"
  );

  for (const skill of [
    "SFT",
    "DPO",
    "GRPO",
    "PPO",
    "RLHF",
    "RLVR",
    "Reward Model",
    "PRM",
    "Verifier",
    "LLM-as-a-Judge",
    "Agent 应用效果闭环",
    "数据配方",
    "评测护栏"
  ]) {
    await createMemory(
      {
        type: "Skill",
        title: skill,
        content: `具备 ${skill} 相关实践或方法论积累。`,
        tags: ["skill", skill.toLowerCase()],
        confidence: 0.82,
        userVerified: true,
        sourceEvidenceIds: []
      },
      "Seed demo skill"
    );
  }

  await createMemory(
    {
      type: "Project",
      title: "K12 多模态互动教学 Agent",
      content:
        "负责结构化互动教学脚本生成，关注幻觉控制、结构稳定性、多模态理解、板书和互动题生成、线上灰度与 badcase 闭环。",
      tags: ["K12", "Agent", "多模态", "badcase", "效果闭环"],
      confidence: 0.9,
      userVerified: true,
      sourceEvidenceIds: []
    },
    "Seed demo project"
  );

  await createMemory(
    {
      type: "Project",
      title: "高英评批",
      content:
        "使用标准分与偏差分离、多维 reward、GRPO、evidence grounding、rubric logic、guardrail，提高评分一致性和评语可靠性。",
      tags: ["GRPO", "reward", "evidence grounding", "rubric", "guardrail"],
      confidence: 0.9,
      userVerified: true,
      sourceEvidenceIds: []
    },
    "Seed demo project"
  );

  await createMemory(
    {
      type: "Project",
      title: "初中数学 PRM + Verifier + PPO",
      content: "使用 PRM、Verifier、SymPy、step-level reward 和 PPO 优化数学长链推理。",
      tags: ["PRM", "Verifier", "PPO", "数学推理", "step-level reward"],
      confidence: 0.88,
      userVerified: true,
      sourceEvidenceIds: []
    },
    "Seed demo project"
  );

  for (const preference of [
    "偏真实业务场景",
    "偏 Agent / 后训练 / RL",
    "偏 owner 空间",
    "偏效果闭环",
    "不喜欢纯基础研究或大平台局部优化"
  ]) {
    await createMemory(
      {
        type: "Preference",
        title: preference,
        content: preference,
        tags: ["preference"],
        confidence: 0.9,
        userVerified: true,
        sourceEvidenceIds: []
      },
      "Seed demo preference"
    );
  }

  await createMemory(
    {
      type: "Constraint",
      title: "目标总包 100w+",
      content: "目标总包 100w+。",
      tags: ["compensation", "constraint"],
      confidence: 0.95,
      userVerified: true,
      sourceEvidenceIds: []
    },
    "Seed demo constraint"
  );

  await createMemory(
    {
      type: "CareerGoal",
      title: "短期目标：找到更适合的大模型 Agent / 后训练 / RL 岗位",
      content: "短期目标：找到更适合的大模型 Agent / 后训练 / RL 岗位。",
      tags: ["career-goal", "short-term", "agent", "post-training"],
      confidence: 0.92,
      userVerified: true,
      sourceEvidenceIds: [jd.id]
    },
    "Seed demo career goal"
  );

  await createMemory(
    {
      type: "CareerGoal",
      title: "长期目标：成为复杂 Agent 系统效果闭环 owner",
      content: "长期目标：成为复杂 Agent 系统效果闭环 owner。",
      tags: ["career-goal", "long-term", "owner", "agent"],
      confidence: 0.92,
      userVerified: true,
      sourceEvidenceIds: []
    },
    "Seed demo career goal"
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
