import Link from "next/link";
import { ArrowRight, BrainCircuit, BriefcaseBusiness, FileText, History } from "lucide-react";

const sections = [
  {
    href: "/memories",
    title: "Memories",
    text: "管理可编辑、可回滚的职业记忆原子。",
    icon: BrainCircuit
  },
  {
    href: "/evidence",
    title: "Evidence",
    text: "沉淀 JD、聊天、面试记录和项目证据。",
    icon: FileText
  },
  {
    href: "/opportunities",
    title: "Opportunities",
    text: "查看机会、评估、风险和记忆匹配关系。",
    icon: BriefcaseBusiness
  },
  {
    href: "/agent-runs",
    title: "Agent Runs",
    text: "审计每次分析流程和待处理 MemorySuggestions。",
    icon: History
  }
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 border-b border-line pb-6">
        <p className="text-sm font-semibold uppercase text-focus">Local-first MVP</p>
        <h1 className="max-w-3xl text-3xl font-semibold text-ink">
          职业记忆、机会分析和证据驱动决策工作台
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          所有长期记忆都保持透明、可编辑、可回滚；Agent 只生成建议，用户手动接受后才写入 Memory。
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="panel group rounded-lg p-5 transition hover:-translate-y-0.5 hover:border-focus"
            >
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-mist text-focus">
                <Icon size={20} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">{section.title}</h2>
                <ArrowRight className="text-slate-400 transition group-hover:text-focus" size={17} />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{section.text}</p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
