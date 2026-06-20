import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndAuditLogs1771131600000 implements MigrationInterface {
  name = 'CreateUsersAndAuditLogs1771131600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app_users" (
        "id" SERIAL NOT NULL,
        "google_id" character varying(255) NOT NULL,
        "email" character varying(320) NOT NULL,
        "name" character varying(160) NOT NULL,
        "avatar_url" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_app_users_google_id" UNIQUE ("google_id"),
        CONSTRAINT "UQ_app_users_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" SERIAL NOT NULL,
        "actor_id" integer NOT NULL,
        "actor_name" character varying(160) NOT NULL,
        "actor_email" character varying(320) NOT NULL,
        "action" character varying(80) NOT NULL,
        "entity_type" character varying(80) NOT NULL,
        "entity_id" character varying(80) NOT NULL,
        "summary" text NOT NULL,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_actor" FOREIGN KEY ("actor_id")
          REFERENCES "app_users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_audit_logs_created_at"');
    await queryRunner.query('DROP TABLE "audit_logs"');
    await queryRunner.query('DROP TABLE "app_users"');
  }
}
