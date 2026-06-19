import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarEntry } from './calendar-entry.entity';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [TypeOrmModule.forFeature([CalendarEntry])],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
