import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCalendarEntryTimes1771135200000 implements MigrationInterface {
  name = 'AddCalendarEntryTimes1771135200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "calendar_entries"
        ADD "start_time" time,
        ADD "end_time" time
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "calendar_entries"
        DROP COLUMN "end_time",
        DROP COLUMN "start_time"
    `);
  }
}
