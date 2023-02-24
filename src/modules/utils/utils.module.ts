import { Web3Service } from './web3.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UtilsService } from './utils.service';
import { MailService } from './mail.service';

@Module({
  imports: [ConfigModule],
  providers: [Web3Service, UtilsService, MailService],
  exports: [Web3Service, UtilsService, MailService],
})
export class UtilsModule {}
