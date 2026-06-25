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
      items: {
        create: [
          {
            order: 1,
            title: "Master Bathroom Tub",
            tips: "Rinse all surfaces, wipe down with disinfectant, and check the drain. Run a lint roller along the edges if needed.",
            qcPrompt:
              "Confirm the bathtub and surrounding tile are clean with NO visible hair, soap scum, or debris in the tub or near the drain.",
            requiresPhoto: true,
          },
          {
            order: 2,
            title: "Master Bed Made",
            tips: "Fitted sheet smooth, duvet centered and pulled to the headboard, pillows fluffed and aligned.",
            qcPrompt:
              "Confirm the bed is neatly made: sheets smooth with no wrinkles, duvet centered and straight, pillows fluffed and evenly arranged.",
            requiresPhoto: true,
          },
          {
            order: 3,
            title: "Living Room Curtains",
            tips: "Pull curtains to full open, straighten folds so they hang evenly.",
            qcPrompt:
              "Confirm the curtains are draped cleanly and evenly, hanging straight with no bunching, twisting, or tangled folds.",
            requiresPhoto: true,
          },
          {
            order: 4,
            title: "Kitchen Counters",
            tips: "Clear all items, wipe counters and backsplash, no crumbs or streaks.",
            qcPrompt:
              "Confirm the kitchen counters are clear, wiped clean, and free of crumbs, stains, streaks, or leftover items.",
            requiresPhoto: true,
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
