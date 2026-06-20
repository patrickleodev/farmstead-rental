import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChatService } from './chat.service';
import type { CreateChatMessage } from './chat.service';

@Controller('api/chat-messages')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  findRecent() {
    return this.chatService.findRecent();
  }

  @Post()
  create(@Body() body: CreateChatMessage, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.create(body, user);
  }
}
