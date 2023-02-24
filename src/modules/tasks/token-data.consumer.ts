import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { SubTasksService } from './sub-tasks.service';

@Processor('token-data-queue-local')
export class TokenDataConsumer {
  private readonly logger = new Logger('TokenDataConsumer');

  constructor(private subTasksService: SubTasksService) {}

  @Process('update-token-owner')
  async updateOrder(job: Job<{ tokenId: string; to: string; blockNumber: number }>) {
    this.logger.log(`Processing job ['update-token-owner'] data: ${JSON.stringify(job.data)}`);
    await this.subTasksService.updateTokenOwner(
      job.data.tokenId,
      job.data.to,
      job.data.blockNumber,
    );

    return true;
  }
}
