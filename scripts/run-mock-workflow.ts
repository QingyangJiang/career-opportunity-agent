import { prisma } from "@/lib/db/prisma";
import { analyzeEvidence } from "@/lib/agent/analyzeEvidence";

async function main() {
  const evidence = await prisma.evidence.findFirst({
    where: { type: "jd" },
    orderBy: { createdAt: "asc" }
  });

  if (!evidence) {
    throw new Error("No JD evidence found. Run npm run seed first.");
  }

  const run = await analyzeEvidence(evidence.id);
  console.log(JSON.stringify(run, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
