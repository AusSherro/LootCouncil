import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check if a profile already exists
  const existingProfile = await prisma.profile.findFirst();
  if (existingProfile) {
    console.log(`Profile already exists: "${existingProfile.name}" (${existingProfile.id})`);
    return;
  }

  // Create "Jacob" profile
  const profile = await prisma.profile.create({
    data: { name: 'Jacob' },
  });
  console.log(`Created profile: "${profile.name}" (${profile.id})`);

  // Update all existing records to belong to Jacob's profile
  const updates = await Promise.all([
    prisma.account.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.categoryGroup.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.payee.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.transfer.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.asset.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.allocationTarget.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.fireSettings.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.scheduledTransaction.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.transactionRule.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.budgetTemplate.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.settings.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
    prisma.apiIntegration.updateMany({ where: { profileId: null }, data: { profileId: profile.id } }),
  ]);

  const totalUpdated = updates.reduce((sum, r) => sum + r.count, 0);
  console.log(`Assigned ${totalUpdated} existing records to profile "${profile.name}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
