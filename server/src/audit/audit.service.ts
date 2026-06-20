import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth-user';
import { AuditLog } from './audit-log.entity';

type AuditEntry = {
  action: string;
  entityType: string;
  entityId: string | number;
  summary: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly logs: Repository<AuditLog>,
  ) {}

  record(actor: AuthenticatedUser, entry: AuditEntry) {
    return this.logs.save(
      this.logs.create({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: entry.action,
        entityType: entry.entityType,
        entityId: String(entry.entityId),
        summary: entry.summary,
        metadata: entry.metadata ?? null,
      }),
    );
  }

  findRecent() {
    return this.logs.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 50,
    });
  }
}
