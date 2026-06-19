import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCalendarEntries1771120800000 implements MigrationInterface {
  name = 'CreateCalendarEntries1771120800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "calendar_entries" (
        "id" SERIAL NOT NULL,
        "title" character varying(120) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" character varying(20) NOT NULL,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_calendar_entries_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_calendar_entries_dates" CHECK ("start_date" <= "end_date"),
        CONSTRAINT "CHK_calendar_entries_status" CHECK ("status" IN ('booked', 'blocked'))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_calendar_entries_dates" ON "calendar_entries" ("start_date", "end_date")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_calendar_entries_dates"');
    await queryRunner.query('DROP TABLE "calendar_entries"');
  }
}
