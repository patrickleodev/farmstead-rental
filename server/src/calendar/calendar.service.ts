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
  CalendarPayment,
  bookingStatuses,
  calendarEntryStatuses,
} from './calendar-entry.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth-user';

export type CreateCalendarEntry = {
  title: string;
  startDate: string;
  startTime?: string | null;
  endDate: string;
  endTime?: string | null;
  status: CalendarEntryStatus;
  bookingStatus?: BookingStatus;
  notes?: string;
  totalAmount?: number;
  depositAmount?: number;
  paidAmount?: number;
  payments?: CalendarPayment[];
};

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(CalendarEntry)
    private readonly calendarEntries: Repository<CalendarEntry>,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly auditService: AuditService,
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

  async create(payload: CreateCalendarEntry, actor: AuthenticatedUser) {
    const entry = this.normalizePayload(payload);
    await this.ensureNoOverlap(entry);
    const savedEntry = await this.calendarEntries.save(
      this.calendarEntries.create(entry),
    );
    await this.auditService.record(actor, {
      action: 'calendar.created',
      entityType: 'calendar_entry',
      entityId: savedEntry.id,
      summary: `Created booking ${savedEntry.title}.`,
    });
    this.realtimeGateway.notifyCalendarChanged('created', savedEntry.id);
    return savedEntry;
  }

  async remove(id: number, actor: AuthenticatedUser) {
    const existingEntry = await this.calendarEntries.findOneBy({ id });
    if (!existingEntry) {
      throw new NotFoundException('Período não encontrado.');
    }
    await this.calendarEntries.delete(id);
    await this.auditService.record(actor, {
      action: 'calendar.removed',
      entityType: 'calendar_entry',
      entityId: id,
      summary: `Removed booking ${existingEntry.title}.`,
    });
    this.realtimeGateway.notifyCalendarChanged('removed', id);
  }

  async update(
    id: number,
    payload: CreateCalendarEntry,
    actor: AuthenticatedUser,
  ) {
    const existingEntry = await this.calendarEntries.findOneBy({ id });
    if (!existingEntry) {
      throw new NotFoundException('Período não encontrado.');
    }

    const entry = this.normalizePayload(payload);
    await this.ensureNoOverlap(entry, id);
    const savedEntry = await this.calendarEntries.save({ ...existingEntry, ...entry });
    await this.auditService.record(actor, {
      action: 'calendar.updated',
      entityType: 'calendar_entry',
      entityId: id,
      summary: `Updated booking ${savedEntry.title}.`,
    });
    this.realtimeGateway.notifyCalendarChanged('updated', id);
    return savedEntry;
  }

  private normalizePayload(payload: CreateCalendarEntry): CreateCalendarEntry {
    const title = payload.title?.trim();
    const notes = payload.notes?.trim();
    const { startDate, endDate, status } = payload;
    const startTime = this.normalizeTime(payload.startTime, 'horário de entrada');
    const endTime = this.normalizeTime(payload.endTime, 'horário de saída');
    const bookingStatus = payload.bookingStatus ?? 'inquiry';
    const totalAmount = this.normalizeAmount(payload.totalAmount, 'valor total');
    const depositAmount = this.normalizeAmount(payload.depositAmount, 'sinal');
    const payments = this.normalizePayments(payload.payments, payload.paidAmount, startDate);
    const paidAmount = this.sumPayments(payments);

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
    this.ensureDateTimeRange(startDate, startTime, endDate, endTime);

    return {
      title,
      startDate,
      startTime,
      endDate,
      endTime,
      status,
      bookingStatus,
      notes: notes || undefined,
      totalAmount,
      depositAmount,
      paidAmount,
      payments,
    };
  }

  private normalizeAmount(value: number | undefined, field: string) {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException(`Informe um ${field} válido.`);
    }
    return Math.round(amount * 100) / 100;
  }

  private normalizePayments(
    payments: CalendarPayment[] | undefined,
    legacyPaidAmount: number | undefined,
    fallbackDate: string,
  ) {
    if (!payments?.length) {
      const paidAmount = this.normalizeAmount(legacyPaidAmount, 'valor já pago');
      return paidAmount > 0 ? [{ date: fallbackDate, amount: paidAmount, note: null }] : [];
    }

    return payments.map((payment, index) => {
      const date = payment.date;
      const amount = this.normalizeAmount(payment.amount, `valor da parcela ${index + 1}`);
      const note = payment.note?.trim();

      if (!this.isDateOnly(date)) {
        throw new BadRequestException(`Informe uma data válida para a parcela ${index + 1}.`);
      }
      if (amount <= 0) {
        throw new BadRequestException(`Informe um valor maior que zero para a parcela ${index + 1}.`);
      }

      return {
        date,
        amount,
        note: note || null,
      };
    });
  }

  private sumPayments(payments: CalendarPayment[]) {
    return Math.round(
      payments.reduce((total, payment) => total + Number(payment.amount || 0), 0) * 100,
    ) / 100;
  }

  private ensureDateRange(startDate: string, endDate: string) {
    const validDate = this.isDateOnly(startDate) && this.isDateOnly(endDate);
    if (!validDate || startDate > endDate) {
      throw new BadRequestException('Informe um intervalo de datas válido.');
    }
  }

  private normalizeTime(value: string | null | undefined, field: string) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (!/^\d{2}:\d{2}$/.test(value)) {
      throw new BadRequestException(`Informe um ${field} vÃ¡lido.`);
    }
    const [hour, minute] = value.split(':').map(Number);
    if (hour > 23 || minute > 59) {
      throw new BadRequestException(`Informe um ${field} vÃ¡lido.`);
    }
    return value;
  }

  private ensureDateTimeRange(
    startDate: string,
    startTime: string | null,
    endDate: string,
    endTime: string | null,
  ) {
    if (
      this.toRangeStart(startDate, startTime) >= this.toRangeEnd(endDate, endTime)
    ) {
      throw new BadRequestException('Informe um intervalo de datas e horários válido.');
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
    entry: CreateCalendarEntry,
    excludedEntryId?: number,
  ) {
    const query = this.calendarEntries
      .createQueryBuilder('entry')
      .where('entry.start_date <= :endDate', { endDate: entry.endDate })
      .andWhere('entry.end_date >= :startDate', { startDate: entry.startDate });

    if (excludedEntryId) {
      query.andWhere('entry.id != :excludedEntryId', { excludedEntryId });
    }

    const candidates = await query.getMany();
    const start = this.toRangeStart(entry.startDate, entry.startTime ?? null);
    const end = this.toRangeEnd(entry.endDate, entry.endTime ?? null);
    const overlap = candidates.find((candidate) => {
      const candidateStart = this.toRangeStart(candidate.startDate, candidate.startTime);
      const candidateEnd = this.toRangeEnd(candidate.endDate, candidate.endTime);
      return candidateStart < end && candidateEnd > start;
    });

    if (overlap) {
      throw new BadRequestException(
        'Esse período já possui uma reserva ou bloqueio.',
      );
    }
  }

  private toRangeStart(date: string, time: string | null) {
    return new Date(`${date}T${time ?? '00:00'}:00`).getTime();
  }

  private toRangeEnd(date: string, time: string | null) {
    const end = new Date(`${date}T${time ?? '00:00'}:00`);
    if (!time) {
      end.setDate(end.getDate() + 1);
    }
    return end.getTime();
  }
}
