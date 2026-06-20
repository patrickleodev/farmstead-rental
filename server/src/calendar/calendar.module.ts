import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarEntry } from './calendar-entry.entity';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([CalendarEntry]), AuditModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
