import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'actor_id' })
  actorId: number;

  @Column({ name: 'actor_name', length: 160 })
  actorName: string;

  @Column({ name: 'actor_email', length: 320 })
  actorEmail: string;

  @Column({ length: 80 })
  action: string;

  @Column({ name: 'entity_type', length: 80 })
  entityType: string;

  @Column({ name: 'entity_id', length: 80 })
  entityId: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
