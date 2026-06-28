import { PrismaClient } from '@prisma/client';

// Safety net: Next.js normally loads .env into process.env at runtime, but if
// the server is launched from the wrong working directory (or the workspace
// root is mis-inferred), DATABASE_URL can be missing/empty and Prisma fails
// with "the URL must start with the protocol file:". Load it explicitly here
// so the client always has a valid datasource URL.
if (!process.env.DATABASE_URL) {
  // dotenv is already a project dependency; load lazily to avoid bundling cost
  // when the variable is already present (the common case).
  require('dotenv').config();
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
