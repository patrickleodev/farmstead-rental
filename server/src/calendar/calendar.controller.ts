import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CalendarEntryStatus } from './calendar-entry.entity';
import { BookingStatus } from './calendar-entry.entity';
import { CalendarService } from './calendar.service';

type CreateCalendarEntryBody = {
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

@Controller('api/calendar-entries')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  findAll(@Query('from') from?: string, @Query('to') to?: string) {
    return this.calendarService.findAll(from, to);
  }

  @Post()
  create(@Body() body: CreateCalendarEntryBody) {
    return this.calendarService.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: CreateCalendarEntryBody) {
    return this.calendarService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.calendarService.remove(id);
  }
}
