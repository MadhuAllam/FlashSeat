/**
 * Mint a JWT for a seeded user:   npm run token -- user1@flashseat.test
 * Phase 5 extends this to bulk-generate tokens for the k6 load test.
 */
import { buildApp } from '../src/app';
import { prisma } from '../src/infra/prisma';
import { redis } from '../src/infra/redis';

async function main(): Promise<void> {
  const email = process.argv[2]?.toLowerCase();
  if (!email) {
    console.error('usage: npm run token -- <email>');
    process.exit(2);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`no such user: ${email} (did you run \`npm run db:seed\`?)`);
    process.exit(1);
  }

  const app = await buildApp();
  await app.ready();
  console.log(app.jwt.sign({ sub: user.id, email: user.email }));

  await app.close();
  await redis.quit();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
