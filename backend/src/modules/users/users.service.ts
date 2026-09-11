import { prisma } from '../../config/prisma';
import type { UpdateProfileInput } from './users.schema';

export interface ProfileDto {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

function toDto(user: { id: string; email: string; displayName: string; createdAt: Date }): ProfileDto {
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt };
}

// Both operations are scoped to `userId` (== req.user.id, never a
// client-supplied id) — there is no route parameter that accepts another
// user's id, so "fetch another user's profile" is not a reachable path.
export async function getProfile(userId: string): Promise<ProfileDto> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toDto(user);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<ProfileDto> {
  const user = await prisma.user.update({ where: { id: userId }, data: input });
  return toDto(user);
}
