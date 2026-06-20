import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuditService } from './audit.service';

@Controller('api/audit-logs')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findRecent() {
    return this.auditService.findRecent();
  }
}
