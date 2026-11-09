import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const tailorEmail = process.env.SEED_TAILOR_EMAIL
  const customerEmail = process.env.SEED_CUSTOMER_EMAIL

  if (!tailorEmail || !customerEmail) {
    throw new Error("SEED_TAILOR_EMAIL and SEED_CUSTOMER_EMAIL must be set")
  }

  const tailor = await prisma.user.upsert({
    where: { email: tailorEmail },
    update: { role: "TAILOR", roleChosen: true },
    create: { email: tailorEmail, name: "Demo Tailor", role: "TAILOR", roleChosen: true },
  })

  const customer = await prisma.user.upsert({
    where: { email: customerEmail },
    update: { role: "CUSTOMER", roleChosen: true },
    create: { email: customerEmail, name: "Demo Customer", role: "CUSTOMER", roleChosen: true },
  })

  console.log("Seeded tailor:", tailor.email)
  console.log("Seeded customer:", customer.email)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
