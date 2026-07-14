import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCalendarEntryPayments1771142400000 implements MigrationInterface {
  name = 'AddCalendarEntryPayments1771142400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "calendar_entries"
        ADD "payments" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      UPDATE "calendar_entries"
      SET "payments" = jsonb_build_array(
        jsonb_build_object(
          'date', "start_date"::text,
          'amount', "paid_amount",
          'note', 'Valor já pago'
        )
      )
      WHERE "paid_amount" > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "calendar_entries"
        DROP COLUMN "payments"
    `);
  }
}
