import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservationDetails1771124400000 implements MigrationInterface {
  name = 'AddReservationDetails1771124400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "calendar_entries"
        ADD "booking_status" character varying(20) NOT NULL DEFAULT 'inquiry',
        ADD "total_amount" numeric(12, 2) NOT NULL DEFAULT 0,
        ADD "deposit_amount" numeric(12, 2) NOT NULL DEFAULT 0,
        ADD "paid_amount" numeric(12, 2) NOT NULL DEFAULT 0,
        ADD CONSTRAINT "CHK_calendar_entries_booking_status"
          CHECK ("booking_status" IN ('inquiry', 'deposit_pending', 'confirmed', 'completed')),
        ADD CONSTRAINT "CHK_calendar_entries_amounts"
          CHECK (
            "total_amount" >= 0 AND
            "deposit_amount" >= 0 AND
            "paid_amount" >= 0 AND
            "deposit_amount" <= "total_amount" AND
            "paid_amount" <= "total_amount"
          )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "calendar_entries"
        DROP CONSTRAINT "CHK_calendar_entries_amounts",
        DROP CONSTRAINT "CHK_calendar_entries_booking_status",
        DROP COLUMN "paid_amount",
        DROP COLUMN "deposit_amount",
        DROP COLUMN "total_amount",
        DROP COLUMN "booking_status"
    `);
  }
}
