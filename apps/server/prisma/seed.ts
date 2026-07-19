import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statementMd = `# Longest Substring Without Repeating Characters

Given a string \`s\`, return the length of its longest substring containing no repeated characters.

## Examples

- \`s = "abcabcbb"\` → \`3\` (\`"abc"\`)
- \`s = "bbbbb"\` → \`1\` (\`"b"\`)
- \`s = "pwwkew"\` → \`3\` (\`"wke"\`)
`;

async function main(): Promise<void> {
  await prisma.assignment.upsert({
    where: { id: "longest-substring-python" },
    update: {},
    create: {
      id: "longest-substring-python",
      title: "Longest Substring Without Repeating Characters",
      statementMd,
      language: "python",
      visibleTestsJson: JSON.stringify([
        { input: "abcabcbb", expected: 3 },
        { input: "bbbbb", expected: 1 },
        { input: "pwwkew", expected: 3 }
      ]),
      hiddenTestsJson: JSON.stringify([
        { input: "", expected: 0 },
        { input: "dvdf", expected: 3 }
      ])
    }
  });
  console.log("Seeded assignment: Longest Substring Without Repeating Characters");
}

main().finally(() => prisma.$disconnect());
