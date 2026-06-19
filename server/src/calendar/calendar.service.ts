import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CalendarEntry,
  CalendarEntryStatus,
  BookingStatus,
  bookingStatuses,
  calendarEntryStatuses,
} from './calendar-entry.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export type CreateCalendarEntry = {
  title: string;
  startDate: string;
  endDate: string;
  status: CalendarEntryStatus;
  bookingStatus?: BookingStatus;
  notes?: string;
  totalAmount?: number;
  depositAmount?: number;
  paidAmount?: number;
};

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(CalendarEntry)
    private readonly calendarEntries: Repository<CalendarEntry>,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async findAll(from?: string, to?: string) {
    if (from && to) {
      this.ensureDateRange(from, to);
      return this.calendarEntries
        .createQueryBuilder('entry')
        .where('entry.start_date <= :to', { to })
        .andWhere('entry.end_date >= :from', { from })
        .orderBy('entry.start_date', 'ASC')
        .addOrderBy('entry.id', 'ASC')
        .getMany();
    }

    return this.calendarEntries.find({
      order: { startDate: 'ASC', id: 'ASC' },
    });
  }

  async create(payload: CreateCalendarEntry) {
    const entry = this.normalizePayload(payload);
    await this.ensureNoOverlap(entry.startDate, entry.endDate);
    const savedEntry = await this.calendarEntries.save(
      this.calendarEntries.create(entry),
    );
    this.realtimeGateway.notifyCalendarChanged('created', savedEntry.id);
    return savedEntry;
  }

  async remove(id: number) {
    const result = await this.calendarEntries.delete(id);
    if (!result.affected) {
      throw new NotFoundException('Período não encontrado.');
    }
    this.realtimeGateway.notifyCalendarChanged('removed', id);
  }

  async update(id: number, payload: CreateCalendarEntry) {
    const existingEntry = await this.calendarEntries.findOneBy({ id });
    if (!existingEntry) {
      throw new NotFoundException('Período não encontrado.');
    }

    const entry = this.normalizePayload(payload);
    await this.ensureNoOverlap(entry.startDate, entry.endDate, id);
    const savedEntry = await this.calendarEntries.save({ ...existingEntry, ...entry });
    this.realtimeGateway.notifyCalendarChanged('updated', id);
    return savedEntry;
  }

  private normalizePayload(payload: CreateCalendarEntry): CreateCalendarEntry {
    const title = payload.title?.trim();
    const notes = payload.notes?.trim();
    const { startDate, endDate, status } = payload;
    const bookingStatus = payload.bookingStatus ?? 'inquiry';
    const totalAmount = this.normalizeAmount(payload.totalAmount, 'valor total');
    const depositAmount = this.normalizeAmount(payload.depositAmount, 'sinal');
    const paidAmount = this.normalizeAmount(payload.paidAmount, 'valor já pago');

    if (!title) {
      throw new BadRequestException('Informe um título para o período.');
    }
    if (!calendarEntryStatuses.includes(status)) {
      throw new BadRequestException('Status do período inválido.');
    }
    if (!bookingStatuses.includes(bookingStatus)) {
      throw new BadRequestException('Situação da reserva inválida.');
    }
    if (depositAmount > totalAmount || paidAmount > totalAmount) {
      throw new BadRequestException(
        'Sinal e valor pago não podem ser maiores que o valor total.',
      );
    }
    this.ensureDateRange(startDate, endDate);

    return {
      title,
      startDate,
      endDate,
      status,
      bookingStatus,
      notes: notes || undefined,
      totalAmount,
      depositAmount,
      paidAmount,
    };
  }

  private normalizeAmount(value: number | undefined, field: string) {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException(`Informe um ${field} válido.`);
    }
    return Math.round(amount * 100) / 100;
  }

  private ensureDateRange(startDate: string, endDate: string) {
    const validDate = this.isDateOnly(startDate) && this.isDateOnly(endDate);
    if (!validDate || startDate > endDate) {
      throw new BadRequestException('Informe um intervalo de datas válido.');
    }
  }

  private isDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }

  private async ensureNoOverlap(
    startDate: string,
    endDate: string,
    excludedEntryId?: number,
  ) {
    const query = this.calendarEntries
      .createQueryBuilder('entry')
      .where('entry.start_date <= :endDate', { endDate })
      .andWhere('entry.end_date >= :startDate', { startDate });

    if (excludedEntryId) {
      query.andWhere('entry.id != :excludedEntryId', { excludedEntryId });
    }

    const overlap = await query.getOne();

    if (overlap) {
      throw new BadRequestException(
        'Esse período já possui uma reserva ou bloqueio.',
      );
    }
  }
}
