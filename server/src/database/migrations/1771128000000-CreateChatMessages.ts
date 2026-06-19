import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatMessages1771128000000 implements MigrationInterface {
  name = 'CreateChatMessages1771128000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id" SERIAL NOT NULL,
        "author" character varying(60) NOT NULL,
        "content" text NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_chat_messages_created_at" ON "chat_messages" ("created_at")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_chat_messages_created_at"');
    await queryRunner.query('DROP TABLE "chat_messages"');
  }
}
