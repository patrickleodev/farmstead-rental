import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChatMessage } from './chat-message.entity';

export type CreateChatMessage = {
  author: string;
  content: string;
};

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly messages: Repository<ChatMessage>,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async findRecent() {
    const messages = await this.messages.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
    });
    return messages.reverse();
  }

  async create(payload: CreateChatMessage) {
    const author = payload.author?.trim();
    const content = payload.content?.trim();

    if (!author || author.length > 60) {
      throw new BadRequestException('Informe um nome com até 60 caracteres.');
    }
    if (!content || content.length > 1_000) {
      throw new BadRequestException('A mensagem deve ter entre 1 e 1000 caracteres.');
    }

    const message = await this.messages.save(
      this.messages.create({ author, content }),
    );
    this.realtimeGateway.notifyChatMessage(message);
    return message;
  }
}
