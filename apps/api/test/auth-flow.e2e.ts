import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type JsonObject = Record<string, any>;

async function jsonRequest(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(data)}`);
  }

  return data as JsonObject;
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const prisma = app.get(PrismaService);
  const suffix = Date.now().toString().slice(-9);
  let userId: string | undefined;
  let summary: JsonObject | undefined;

  try {
    const registration = await jsonRequest(`${baseUrl}/api/auth/resident/register`, {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Bodija Registration Test',
        phone: `080${suffix}`,
        email: `resident-test-${suffix}@example.com`,
        password: 'secure-test-password',
        neighbourhood: 'New Bodija',
        memberCategory: 'Resident member',
        consent: true,
      }),
    });

    userId = await prisma.user
      .findUniqueOrThrow({ where: { phone: `080${suffix}` }, select: { id: true } })
      .then(user => user.id);

    if (
      !registration.accessToken ||
      registration.resident.card.status !== 'PENDING_VERIFICATION' ||
      !registration.resident.card.qrToken
    ) {
      throw new Error('Registration did not issue the expected pending digital card');
    }

    const login = await jsonRequest(`${baseUrl}/api/auth/resident/login`, {
      method: 'POST',
      body: JSON.stringify({
        identifier: `resident-test-${suffix}@example.com`,
        password: 'secure-test-password',
      }),
    });

    const session = await jsonRequest(`${baseUrl}/api/auth/resident/me`, {
      headers: { Authorization: `Bearer ${login.accessToken}` },
    });

    if (session.resident.id !== registration.resident.id) {
      throw new Error('Authenticated resident session returned the wrong profile');
    }

    const updatedProfile = await jsonRequest(`${baseUrl}/api/auth/resident/me`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${login.accessToken}` },
      body: JSON.stringify({
        fullName: 'Bodija Registration Test Updated',
        neighbourhood: 'Old Bodija',
        memberCategory: 'Community member',
        email: `resident-test-${suffix}@example.com`,
        phone: `080${suffix}`,
      }),
    });

    if (
      updatedProfile.resident.fullName !== 'Bodija Registration Test Updated' ||
      updatedProfile.resident.neighbourhood !== 'Old Bodija' ||
      updatedProfile.resident.memberCategory !== 'Community member'
    ) {
      throw new Error('Resident profile update did not persist the requested changes');
    }

    const securityLogin = await jsonRequest('http://127.0.0.1:5001/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@command.local',
        password: 'admin123',
      }),
    });

    const scanResponse = await fetch('http://127.0.0.1:5001/api/access/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${securityLogin.token}`,
      },
      body: JSON.stringify({
        token: registration.resident.card.qrToken,
        direction: 'ENTRY',
        gate: 'Main Gate',
      }),
    });
    const scan = await scanResponse.json() as JsonObject;

    if (scanResponse.status !== 403 || scan.decision !== 'DENIED') {
      throw new Error('SIGAR allowed a card that is still pending approval');
    }

    const adminLogin = await jsonRequest(`${baseUrl}/api/auth/admin/login`, {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'gisknigeria@gmail.com',
        password: process.env.ADMIN_INITIAL_PASSWORD || 'BodijaAdmin@2026',
      }),
    });

    const approval = await jsonRequest(
      `${baseUrl}/api/admin/residents/${registration.resident.id}/status`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminLogin.accessToken}` },
        body: JSON.stringify({ status: 'APPROVED' }),
      },
    );

    if (approval.approvalStatus !== 'APPROVED' || approval.card.status !== 'ACTIVE') {
      throw new Error('Admin approval did not activate the resident card');
    }

    const allowedResponse = await fetch('http://127.0.0.1:5001/api/access/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${securityLogin.token}`,
      },
      body: JSON.stringify({
        token: registration.resident.card.qrToken,
        direction: 'ENTRY',
        gate: 'Main Gate',
      }),
    });
    const allowedScan = await allowedResponse.json() as JsonObject;
    if (!allowedResponse.ok || allowedScan.decision !== 'ALLOWED') {
      throw new Error('SIGAR did not allow the admin-approved card');
    }

    summary = {
      registration: 'passed',
      login: 'passed',
      sessionRecovery: 'passed',
      pendingCardDecision: scan.decision,
      adminApproval: approval.approvalStatus,
      activeCardDecision: allowedScan.decision,
    };
  } finally {
    if (userId) {
      const resident = await prisma.resident.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (resident) {
        await prisma.$transaction([
          prisma.card.deleteMany({ where: { residentId: resident.id } }),
          prisma.resident.delete({ where: { id: resident.id } }),
          prisma.user.delete({ where: { id: userId } }),
        ]);
      }
    }
    await app.close();
  }

  console.log(JSON.stringify({ ...summary, testDataCleanup: 'passed' }));
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
