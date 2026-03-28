/**
 * Admin CLI script
 *
 * Usage (run from /backend):
 *   npx tsx scripts/admin.ts list
 *   npx tsx scripts/admin.ts grant <email>
 *   npx tsx scripts/admin.ts revoke <email>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const [, , cmd, arg] = process.argv;

async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      planExpiresAt: true,
      balanceMessages: true,
      balanceImages: true,
      addonMessages: true,
      addonImages: true,
      createdAt: true,
    },
  });

  console.log('\n── Users (' + users.length + ') ──────────────────────────────────────');
  for (const u of users) {
    const exp = u.planExpiresAt ? u.planExpiresAt.toISOString().slice(0, 10) : '—';
    console.log(
      `[${u.createdAt.toISOString().slice(0, 10)}]  ${u.email?.padEnd(35) ?? '—'.padEnd(35)}  ` +
      `${u.name?.padEnd(20) ?? '—'.padEnd(20)}  ` +
      `plan=${u.plan.padEnd(8)}  exp=${exp}  ` +
      `msgs=${u.balanceMessages + u.addonMessages}  imgs=${u.balanceImages + u.addonImages}`,
    );
  }
  console.log('');
}

async function grantUnlimited(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: 'ULTRA',
      planExpiresAt: null,           // never expires
      balanceMessages: 9_999_999,
      balanceImages:   9_999_999,
      addonMessages:   0,
      addonImages:     0,
    },
  });

  console.log(`✓ Unlimited access granted to ${email} (plan=ULTRA, 9 999 999 msgs + imgs, no expiry)`);
}

async function revoke(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: 'FREE',
      planExpiresAt: null,
      balanceMessages: 5,
      balanceImages:   3,
      addonMessages:   0,
      addonImages:     0,
    },
  });

  console.log(`✓ Reverted ${email} to FREE plan`);
}

async function main() {
  if (!cmd || cmd === 'list') {
    await listUsers();
  } else if (cmd === 'grant') {
    if (!arg) { console.error('Usage: npx tsx scripts/admin.ts grant <email>'); process.exit(1); }
    await grantUnlimited(arg);
  } else if (cmd === 'revoke') {
    if (!arg) { console.error('Usage: npx tsx scripts/admin.ts revoke <email>'); process.exit(1); }
    await revoke(arg);
  } else {
    console.error(`Unknown command: ${cmd}\nAvailable: list | grant <email> | revoke <email>`);
    process.exit(1);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
