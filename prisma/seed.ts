import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Ensure a Settings singleton exists.
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, recipients: process.env.REPORT_RECIPIENTS ?? "" },
  });

  const existing = await prisma.property.findFirst({
    where: { name: "Sample Beach House" },
  });
  if (existing) {
    console.log("Sample property already exists, skipping seed.");
    return;
  }

  const property = await prisma.property.create({
    data: {
      name: "Sample Beach House",
      address: "123 Ocean Ave",
      pin: "1234",
      areas: {
        create: [
          {
            name: "Common Areas",
            kind: "common",
            order: 1,
            items: {
              create: [
                {
                  order: 1,
                  title: "Living Room Curtains",
                  tips: "Pull curtains to full open, straighten folds so they hang evenly.",
                  qcPrompt:
                    "Confirm the curtains are draped cleanly and evenly, hanging straight with no bunching or tangled folds.",
                },
                {
                  order: 2,
                  title: "Kitchen Counters",
                  tips: "Clear all items, wipe counters and backsplash, no crumbs or streaks.",
                  qcPrompt:
                    "Confirm the kitchen counters are clear, wiped clean, and free of crumbs, stains, streaks, or leftover items.",
                },
              ],
            },
          },
          {
            name: "Master Bedroom",
            kind: "room",
            order: 2,
            items: {
              create: [
                {
                  order: 1,
                  title: "Master Bed Made",
                  tips: "Fitted sheet smooth, duvet centered and pulled to the headboard, pillows fluffed.",
                  qcPrompt:
                    "Confirm the bed is neatly made: sheets smooth, duvet centered and straight, pillows fluffed and evenly arranged.",
                },
              ],
            },
          },
          {
            name: "Master Bathroom",
            kind: "room",
            order: 3,
            items: {
              create: [
                {
                  order: 1,
                  title: "Bathtub",
                  tips: "Rinse all surfaces, wipe with disinfectant, check the drain. Lint-roll the edges if needed.",
                  qcPrompt:
                    "Confirm the bathtub and surrounding tile are clean with NO visible hair, soap scum, or debris in the tub or near the drain.",
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`Seeded property "${property.name}" with PIN 1234.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
