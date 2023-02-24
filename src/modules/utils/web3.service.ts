import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Web3 from 'web3';
import { METEAST_CONTRACT_ABI } from '../../contracts/MET';
import { METEAST_MARKET_CONTRACT_ABI } from '../../contracts/METMarket';
import { CallOfBatch } from './interfaces';

@Injectable()
export class Web3Service {
  public web3WS;
  public web3RPC;
  public metContractWS;
  public metMarketContractWS;
  public metContractRPC;
  public metMarketContractRPC;

  constructor(private configService: ConfigService) {
    const escWSUrl = this.configService.get('ESC_WS');
    const escRPCUrl = this.configService.get('ESC_RPC');

    const options = {
      //timeout: 30000, // ms
      // Useful for credentialed urls, e.g: ws://username:password@localhost:8546
      //headers: {
      //    authorization: 'Basic username:password'
      //},
      clientConfig: {
        // Useful if requests are large
        maxReceivedFrameSize: 100000000, // bytes - default: 1MiB
        maxReceivedMessageSize: 100000000, // bytes - default: 8MiB
        keepalive: true, // Useful to keep a connection alive
        keepaliveInterval: 60000, // ms
      },
      reconnect: {
        auto: true,
        delay: 1000,
        maxAttempts: 5,
        onTimeout: false,
      },
    };

    this.web3WS = new Web3(new Web3.providers.WebsocketProvider(escWSUrl, options));
    this.web3RPC = new Web3(new Web3.providers.HttpProvider(escRPCUrl));

    this.metContractWS = new this.web3WS.eth.Contract(
      METEAST_CONTRACT_ABI,
      this.configService.get('CONTRACT_MET'),
    );
    this.metMarketContractWS = new this.web3WS.eth.Contract(
      METEAST_MARKET_CONTRACT_ABI,
      this.configService.get('CONTRACT_MARKET'),
    );
    this.metContractRPC = new this.web3RPC.eth.Contract(
      METEAST_CONTRACT_ABI,
      this.configService.get('CONTRACT_MET'),
    );
    this.metMarketContractRPC = new this.web3RPC.eth.Contract(
      METEAST_MARKET_CONTRACT_ABI,
      this.configService.get('CONTRACT_MARKET'),
    );
  }

  web3BatchRequest(calls: CallOfBatch[]): Promise<any> {
    const batch = new this.web3RPC.BatchRequest();
    const promises = calls.map((call) => {
      return new Promise((res, rej) => {
        const req = call['method'].request(call['params'], (err, data) => {
          if (err) rej(err);
          else res(data);
        });
        batch.add(req);
      });
    });
    batch.execute();
    return Promise.all(promises);
  }
}
