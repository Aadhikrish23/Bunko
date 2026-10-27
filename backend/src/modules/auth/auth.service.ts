import { randomUUID } from 'crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { logger } from '../../lib/logger';
import type { LoginInput, RegisterInput } from './auth.schema';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

function issueTokens(userId: string, email: string, refreshJti: string): AuthTokens {
  const accessToken = jwt.sign({ sub: userId, email }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
  });
  const refreshToken = jwt.sign({ sub: userId, jti: refreshJti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY,
  });
  return { accessToken, refreshToken };
}

function toAuthUser(user: { id: string; email: string; displayName: string }): AuthUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function register(input: RegisterInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError('CONFLICT', 'Email is already registered');
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const refreshJti = randomUUID();

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      currentRefreshTokenId: refreshJti,
    },
  });

  return { user: toAuthUser(user), tokens: issueTokens(user.id, user.email, refreshJti) };
}

export async function login(input: LoginInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Same error either way — never reveal whether the email exists
  // (docs/TESTING_STRATEGY.md §3).
  const invalidCredentials = (): AppError => new AppError('UNAUTHENTICATED', 'Invalid email or password');

  if (!user) {
    // Pay the argon2 verification cost anyway so response timing doesn't
    // leak whether the email exists.
    await argon2.hash(input.password).catch(() => undefined);
    throw invalidCredentials();
  }

  const passwordValid = await argon2.verify(user.passwordHash, input.password);
  if (!passwordValid) {
    throw invalidCredentials();
  }

  const refreshJti = randomUUID();
  await prisma.user.update({ where: { id: user.id }, data: { currentRefreshTokenId: refreshJti } });

  return { user: toAuthUser(user), tokens: issueTokens(user.id, user.email, refreshJti) };
}

// How long a just-rotated-away refresh token still works. Covers two requests
// that both held the previous token (e.g. a burst of calls right as the
// access token expires) without opening a real reuse window (R5-06).
const REFRESH_GRACE_MS = 10_000;

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Refresh token has already been used or revoked');
  }

  if (user.currentRefreshTokenId === payload.jti) {
    const newJti = randomUUID();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        currentRefreshTokenId: newJti,
        previousRefreshTokenId: payload.jti,
        previousRefreshTokenExpiresAt: new Date(Date.now() + REFRESH_GRACE_MS),
      },
    });
    return issueTokens(user.id, user.email, newJti);
  }

  const withinGrace =
    user.previousRefreshTokenId === payload.jti &&
    !!user.previousRefreshTokenExpiresAt &&
    user.previousRefreshTokenExpiresAt.getTime() > Date.now();
  if (withinGrace && user.currentRefreshTokenId) {
    // Already rotated by a concurrent request; hand back the pair that
    // rotation already produced instead of rotating again.
    return issueTokens(user.id, user.email, user.currentRefreshTokenId);
  }

  // Reuse of an already-rotated (or otherwise stale) refresh token —
  // a security-relevant event worth its own log line (SRS §32).
  logger.warn({ userId: payload.sub }, 'refresh token reuse detected');
  throw new AppError('UNAUTHENTICATED', 'Refresh token has already been used or revoked');
}
