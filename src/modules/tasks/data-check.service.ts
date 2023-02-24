import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../database/db.service';
import { Web3Service } from '../utils/web3.service';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MailService } from '../utils/mail.service';

@Injectable()
export class DataCheckService {
  private readonly logger = new Logger('DataCheckService');

  constructor(
    private configService: ConfigService,
    private dbService: DbService,
    private web3Service: Web3Service,
    private mailService: MailService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  @Interval(1000 * 60 * 2)
  async OrderAndTokenCountCheck() {
    const dbOrderCount = await this.dbService.orderCount();
    const dbTokenCount = await this.dbService.tokenCount();

    const [web3OrderCount, web3TokenCount] = await this.web3Service.web3BatchRequest([
      {
        method: this.web3Service.metMarketContractRPC.methods.getOrderCount().call,
        params: {},
      },
      {
        method: this.web3Service.metContractRPC.methods.totalSupply().call,
        params: {},
      },
    ]);

    this.logger.log(`DB Order Count: ${dbOrderCount}     Web3 Order Count: ${web3OrderCount}`);
    this.logger.log(`DB Token Count: ${dbTokenCount}     Web3 Token Count: ${web3TokenCount}`);

    if (dbOrderCount != web3OrderCount) {
      await this.mailService.sendMail(
        'lifayi2008@163.com',
        'MetEast Assist Service Sync Failed',
        'DB Order Count: ' + dbOrderCount + '     Web3 Order Count: ' + web3OrderCount,
      );
    }

    if (dbTokenCount != web3TokenCount) {
      await this.mailService.sendMail(
        'lifayi2008@163.com',
        'MetEast Assist Service Sync Failed',
        'DB Token Count: ' + dbTokenCount + '     Web3 Order Count: ' + web3TokenCount,
      );
    }
  }
}
