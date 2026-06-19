import { Body, Controller, Get, Post } from '@nestjs/common';
import { ChatService } from './chat.service';
import type { CreateChatMessage } from './chat.service';

@Controller('api/chat-messages')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  findRecent() {
    return this.chatService.findRecent();
  }

  @Post()
  create(@Body() body: CreateChatMessage) {
    return this.chatService.create(body);
  }
}
