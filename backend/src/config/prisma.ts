import { PrismaClient } from '@prisma/client';

// Single shared client per process (Prisma's recommended pattern) —
// every service imports this rather than instantiating its own client.
export const prisma = new PrismaClient();
