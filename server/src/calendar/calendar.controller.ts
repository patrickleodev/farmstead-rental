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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  BookingStatus,
  CalendarEntryStatus,
} from './calendar-entry.entity';
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
@UseGuards(AuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  findAll(@Query('from') from?: string, @Query('to') to?: string) {
    return this.calendarService.findAll(from, to);
  }

  @Post()
  create(
    @Body() body: CreateCalendarEntryBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendarService.create(body, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateCalendarEntryBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendarService.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.calendarService.remove(id, user);
  }
}
