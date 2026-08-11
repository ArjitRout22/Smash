/**
 * Create (or promote) an ADMIN user for production — no demo seed required.
 *
 *   npm run create:admin -- <email> <password> "Full Name"
 *
 * Idempotent: if the email already exists, its role → ADMIN and the password is
 * reset to the one supplied. Password must be at least 8 characters.
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

async function main() {
  const [, , emailArg, password, ...nameParts] = process.argv;
  if (!emailArg || !password) {
    console.error('Usage: npm run create:admin -- <email> <password> "Full Name"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  const name = nameParts.join(" ").trim() || "Admin";
  const passwordHash = hashPassword(password);

  const role = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN", description: "Administrator" },
  });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { roleId: role.id, passwordHash, name, isActive: true, deletedAt: null },
    });
    console.log(`✅ Updated existing user "${email}" → ADMIN.`);
  } else {
    const player = await prisma.player.create({
      data: { fullName: name, displayName: name.split(" ")[0] || name },
    });
    await prisma.user.create({
      data: { email, passwordHash, name, roleId: role.id, playerId: player.id },
    });
    console.log(`✅ Created ADMIN user "${email}".`);
  }
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
