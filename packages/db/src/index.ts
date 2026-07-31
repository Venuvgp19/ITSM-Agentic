import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

// TypeScript enums mapping to SQLite string values
export enum Priority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MODERATE = 'MODERATE',
  LOW = 'LOW',
  PLANNING = 'PLANNING',
}

export enum Urgency {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum Impact {
  ENTERPRISE = 'ENTERPRISE',
  DEPARTMENT = 'DEPARTMENT',
  TEAM = 'TEAM',
  INDIVIDUAL = 'INDIVIDUAL',
}

export enum IncidentState {
  NEW = 'NEW',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum ChangeType {
  STANDARD = 'STANDARD',
  NORMAL = 'NORMAL',
  EMERGENCY = 'EMERGENCY',
}

export enum ChangeState {
  DRAFT = 'DRAFT',
  ASSESS = 'ASSESS',
  AUTHORIZE = 'AUTHORIZE',
  SCHEDULED = 'SCHEDULED',
  IMPLEMENTATION = 'IMPLEMENTATION',
  REVIEW = 'REVIEW',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum ApprovalState {
  NOT_REQUESTED = 'NOT_REQUESTED',
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum TaskState {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING = 'PENDING',
  COMPLETE = 'COMPLETE',
  CLOSED_INCOMPLETE = 'CLOSED_INCOMPLETE',
}

export enum AssetStatus {
  IN_STOCK = 'IN_STOCK',
  IN_USE = 'IN_USE',
  MAINTENANCE = 'MAINTENANCE',
  RETIRED = 'RETIRED',
  DISPOSED = 'DISPOSED',
}

export enum CIStatus {
  OPERATIONAL = 'OPERATIONAL',
  NON_OPERATIONAL = 'NON_OPERATIONAL',
  MAINTENANCE = 'MAINTENANCE',
  RETIRED = 'RETIRED',
}

export enum WorkflowStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum ExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
