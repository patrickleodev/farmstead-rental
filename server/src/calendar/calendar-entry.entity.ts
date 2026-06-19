import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const calendarEntryStatuses = ['booked', 'blocked'] as const;
export const bookingStatuses = [
  'inquiry',
  'deposit_pending',
  'confirmed',
  'completed',
] as const;

export type CalendarEntryStatus = (typeof calendarEntryStatuses)[number];
export type BookingStatus = (typeof bookingStatuses)[number];

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

@Entity({ name: 'calendar_entries' })
export class CalendarEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'title', length: 120 })
  title: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ type: 'varchar', length: 20 })
  status: CalendarEntryStatus;

  @Column({ name: 'booking_status', type: 'varchar', length: 20, default: 'inquiry' })
  bookingStatus: BookingStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalAmount: number;

  @Column({
    name: 'deposit_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  depositAmount: number;

  @Column({
    name: 'paid_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  paidAmount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
