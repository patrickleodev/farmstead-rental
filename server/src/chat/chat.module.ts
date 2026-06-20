import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatMessage } from './chat-message.entity';
import { ChatService } from './chat.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage]), AuditModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
