import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../database/db.service';
import { Web3Service } from '../utils/web3.service';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { getTokenEventModel } from '../common/models/TokenEventModel';
import { Constants } from '../../constants';
import { SubTasksService } from './sub-tasks.service';
import { ContractTokenInfo, OrderEventType, OrderState, OrderType } from './interfaces';
import { ConfigService } from '@nestjs/config';
import { getOrderEventModel } from '../common/models/OrderEventModel';
import { CallOfBatch } from '../utils/interfaces';
import { Timeout } from '@nestjs/schedule';
import { Sleep } from '../utils/utils.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class TasksService {
  private readonly logger = new Logger('TasksService');

  private readonly step = 5000;
  private readonly stepInterval = 1000 * 10;

  constructor(
    private subTasksService: SubTasksService,
    private configService: ConfigService,
    private dbService: DbService,
    private web3Service: Web3Service,
    @InjectConnection() private readonly connection: Connection,
    @InjectQueue('order-data-queue') private orderDataQueue: Queue,
  ) {}

  private getBaseBatchRequestParam(event: any): CallOfBatch[] {
    return [
      // {
      //   method: this.web3Service.web3RPC.eth.getTransaction,
      //   params: event.transactionHash,
      // },
      {
        method: this.web3Service.web3RPC.eth.getBlock,
        params: event.blockNumber,
      },
    ];
  }

  @Timeout('transfer', 1000)
  async handleTransferEvent() {
    const nowHeight = await this.web3Service.web3RPC.eth.getBlockNumber();
    const lastHeight = await this.dbService.getTokenEventLastHeight();

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;
      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync past Transfer events from [${fromBlock}] to [${toBlock}]`);

        this.web3Service.metContractWS
          .getPastEvents('Transfer', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleTransferEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync past Transfer events from [${lastHeight + 1}] to [${nowHeight}] finished ✅☕🚾️`,
      );
    }

    this.logger.log(`Start sync Transfer events from [${syncStartBlock + 1}] 💪💪💪 `);

    this.web3Service.metContractWS.events
      .Transfer({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleTransferEventData(event);
      });
  }

  private async handleTransferEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      from: event.returnValues._from,
      to: event.returnValues._to,
      tokenId: event.returnValues._tokenId,
    };

    this.logger.log(`Received Transfer Event: ${JSON.stringify(eventInfo)}`);

    // const [txInfo, blockInfo, contractTokenInfo] = await this.web3Service.web3BatchRequest([
    //   ...this.getBaseBatchRequestParam(event),
    //   {
    //     method: this.web3Service.metContractRPC.methods.tokenInfo(event.returnValues._tokenId).call,
    //     params: {},
    //   },
    // ]);

    const TokenEventModel = getTokenEventModel(this.connection);
    const tokenEvent = new TokenEventModel({
      ...eventInfo,
      // gasFee: (txInfo.gas * txInfo.gasPrice) / Constants.ELA_ESC_PRECISION,
      // timestamp: blockInfo.timestamp,
    });

    await tokenEvent.save();

    if (eventInfo.from === Constants.BURN_ADDRESS) {
      const contractTokenInfo = await this.web3Service.metContractRPC.methods
        .tokenInfo(event.returnValues._tokenId)
        .call();
      await this.subTasksService.dealWithNewToken(
        contractTokenInfo as ContractTokenInfo,
        eventInfo.blockNumber,
      );
    } else {
      const CONTRACT_ADDRESS = this.configService.get('CONTRACT_MARKET');
      if (eventInfo.to !== CONTRACT_ADDRESS) {
        await this.subTasksService.updateTokenOwner(
          eventInfo.tokenId,
          eventInfo.to,
          eventInfo.blockNumber,
        );

        await this.subTasksService.updateBackendTokenOwner(eventInfo.tokenId, eventInfo.to);
      }
    }
  }

  @Timeout('orderForAuction', 30 * 1000)
  async handleOrderForAuctionEvent() {
    const nowHeight = await this.web3Service.web3RPC.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(OrderEventType.OrderForAuction);

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;
      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync past OrderForAuction events from [${fromBlock}] to [${toBlock}]`);
        this.web3Service.metMarketContractWS
          .getPastEvents('OrderForAuction', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderForAuctionEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync past OrderForAuction events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(`Start sync OrderForAuction events from [${syncStartBlock + 1}] 💪💪💪 `);

    this.web3Service.metMarketContractWS.events
      .OrderForAuction({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderForAuctionEventData(event);
      });
  }

  private async handleOrderForAuctionEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      orderId: event.returnValues._orderId,
      tokenId: event.returnValues._tokenId,
      quoteToken: event.returnValues._quoteToken,
      minPrice: event.returnValues._minPrice,
      endTime: event.returnValues._endTime,
    };

    this.logger.log(`Received OrderForAuction Event: ${JSON.stringify(eventInfo)}`);

    const [blockInfo, contractOrderInfo] = await this.web3Service.web3BatchRequest([
      ...this.getBaseBatchRequestParam(event),
      {
        method: this.web3Service.metMarketContractRPC.methods.getOrderById(
          event.returnValues._orderId,
        ).call,
        params: {},
      },
    ]);

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      eventType: OrderEventType.OrderForAuction,
      // gasFee: (txInfo.gas * txInfo.gasPrice) / Constants.ELA_ESC_PRECISION,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.orderDataQueue.add(
      'new-order',
      {
        blockNumber: event.blockNumber,
        tokenId: eventInfo.tokenId,
        orderId: parseInt(eventInfo.orderId),
        seller: eventInfo.seller,
        orderType: OrderType.Auction,
        orderState: OrderState.Created,
        orderPrice: parseInt(eventInfo.minPrice),
        createTime: parseInt(contractOrderInfo.createTime),
        endTime: parseInt(eventInfo.endTime),
        isBlindBox: contractOrderInfo.isBlindBox,
      },
      { removeOnComplete: true },
    );

    await this.subTasksService.dealWithNewOrder(contractOrderInfo);
  }

  @Timeout('orderBid', 60 * 1000)
  async handleOrderBidEvent() {
    const nowHeight = await this.web3Service.web3RPC.eth.getBlockNumber();
    const lastHeight = await this.dbService.getBidOrderEventLastHeight();

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;
      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync past OrderBid events from [${fromBlock}] to [${toBlock}]`);
        this.web3Service.metMarketContractWS
          .getPastEvents('OrderBid', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderBidEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync past OrderBid events from [${lastHeight + 1}] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(`Start sync OrderBid events from [${syncStartBlock + 1}] 💪💪💪 `);
    this.web3Service.metMarketContractWS.events
      .OrderBid({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderBidEventData(event);
      });
  }

  private async handleOrderBidEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      buyer: event.returnValues._buyer,
      orderId: event.returnValues._orderId,
      price: event.returnValues._price,
    };

    this.logger.log(`Received BidOrder Event: ${JSON.stringify(eventInfo)}`);

    await this.orderDataQueue.add(
      'update-order-price',
      {
        blockNumber: event.blockNumber,
        orderId: parseInt(eventInfo.orderId),
        orderPrice: parseInt(eventInfo.price),
      },
      { removeOnComplete: true },
    );

    await this.orderDataQueue.add(
      'update-order-buyer',
      {
        blockNumber: event.blockNumber,
        orderId: parseInt(eventInfo.orderId),
        buyer: eventInfo.buyer,
      },
      { removeOnComplete: true },
    );

    const [blockInfo, contractOrderInfo] = await this.web3Service.web3BatchRequest([
      ...this.getBaseBatchRequestParam(event),
      {
        method: this.web3Service.metMarketContractRPC.methods.getOrderById(
          event.returnValues._orderId,
        ).call,
        params: {},
      },
    ]);

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      eventType: OrderEventType.OrderBid,
      // gasFee: (txInfo.gas * txInfo.gasPrice) / Constants.ELA_ESC_PRECISION,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.subTasksService.updateOrder(parseInt(eventInfo.orderId), {
      orderState: parseInt(contractOrderInfo.orderState),
      buyerAddr: contractOrderInfo.buyerAddr,
      buyerUri: contractOrderInfo.buyerUri,
      filled: parseInt(contractOrderInfo.filled),
      platformAddr: contractOrderInfo.platformAddr,
      platformFee: parseInt(contractOrderInfo.platformFee),
      updateTime: parseInt(contractOrderInfo.updateTime),
      bids: parseInt(contractOrderInfo.bids),
      lastBid: parseInt(contractOrderInfo.lastBid),
      lastBidder: contractOrderInfo.lastBidder,
      price: contractOrderInfo.price,
    });
  }

  @Timeout('orderForSale', 30 * 1000)
  async handleOrderForSaleEvent() {
    const nowHeight = await this.web3Service.web3RPC.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(OrderEventType.OrderForSale);

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync past OrderForSale events from [${fromBlock}] to [${toBlock}]`);
        this.web3Service.metMarketContractWS
          .getPastEvents('OrderForSale', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderForSaleEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync past OrderForSale events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(`Start sync OrderForSale events from [${syncStartBlock + 1}] 💪💪💪 `);
    this.web3Service.metMarketContractWS.events
      .OrderForSale({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderForSaleEventData(event);
      });
  }

  private async handleOrderForSaleEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      orderId: event.returnValues._orderId,
      tokenId: event.returnValues._tokenId,
      price: event.returnValues._price,
    };

    this.logger.log(`Received OrderForSale Event: ${JSON.stringify(eventInfo)}`);

    const [blockInfo, contractOrderInfo] = await this.web3Service.web3BatchRequest([
      ...this.getBaseBatchRequestParam(event),
      {
        method: this.web3Service.metMarketContractRPC.methods.getOrderById(
          event.returnValues._orderId,
        ).call,
        params: {},
      },
    ]);

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      eventType: OrderEventType.OrderForSale,
      // gasFee: (txInfo.gas * txInfo.gasPrice) / Constants.ELA_ESC_PRECISION,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.orderDataQueue.add(
      'new-order',
      {
        blockNumber: event.blockNumber,
        tokenId: eventInfo.tokenId,
        orderId: parseInt(eventInfo.orderId),
        seller: eventInfo.seller,
        orderType: OrderType.Sale,
        orderState: OrderState.Created,
        orderPrice: parseInt(eventInfo.price),
        createTime: parseInt(contractOrderInfo.createTime),
        isBlindBox: contractOrderInfo.isBlindBox,
      },
      { removeOnComplete: true },
    );

    await this.subTasksService.dealWithNewOrder(contractOrderInfo);
  }

  @Timeout('orderPriceChanged', 60 * 1000)
  async handleOrderPriceChangedEvent() {
    const nowHeight = await this.web3Service.web3RPC.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(
      OrderEventType.OrderPriceChanged,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync past OrderPriceChanged events from [${fromBlock}] to [${toBlock}]`);

        this.web3Service.metMarketContractWS
          .getPastEvents('OrderPriceChanged', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderPriceChangedEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync past OrderPriceChanged events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️`,
      );
    }

    this.logger.log(`Start sync OrderPriceChanged events from [${syncStartBlock + 1}] 💪💪💪 `);

    this.web3Service.metMarketContractWS.events
      .OrderPriceChanged({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderPriceChangedEventData(event);
      });
  }

  private async handleOrderPriceChangedEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      orderId: event.returnValues._orderId,
      oldPrice: event.returnValues._oldPrice,
      newPrice: event.returnValues._newPrice,
    };

    this.logger.log(`Received OrderPriceChanged Event: ${JSON.stringify(eventInfo)}`);

    await this.orderDataQueue.add(
      'update-order-price',
      {
        blockNumber: event.blockNumber,
        orderId: parseInt(eventInfo.orderId),
        orderPrice: parseInt(eventInfo.newPrice),
      },
      { removeOnComplete: true },
    );

    const [blockInfo] = await this.web3Service.web3BatchRequest([
      ...this.getBaseBatchRequestParam(event),
    ]);

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      eventType: OrderEventType.OrderPriceChanged,
      // gasFee: (txInfo.gas * txInfo.gasPrice) / Constants.ELA_ESC_PRECISION,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.subTasksService.updateOrder(parseInt(eventInfo.orderId), {
      price: parseInt(eventInfo.newPrice),
      updateTime: orderEvent.timestamp,
    });
  }

  @Timeout('orderFilled', 60 * 1000)
  async handleOrderFilledEvent() {
    const nowHeight = await this.web3Service.web3RPC.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(OrderEventType.OrderFilled);

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync past OrderFilled events from [${fromBlock}] to [${toBlock}]`);

        this.web3Service.metMarketContractWS
          .getPastEvents('OrderFilled', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderFilledEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync past OrderFilled events from [${lastHeight + 1}] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(`Start sync OrderFilled events from [${syncStartBlock + 1}] 💪💪💪 `);
    this.web3Service.metMarketContractWS.events
      .OrderFilled({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderFilledEventData(event);
      });
  }

  private async handleOrderFilledEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      buyer: event.returnValues._buyer,
      orderId: event.returnValues._orderId,
      quoteToken: event.returnValues._quoteToken,
      price: event.returnValues._price,
      royaltyOwner: event.returnValues._royaltyOwner,
      royaltyFee: event.returnValues._royaltyFee,
      platformAddress: event.returnValues._platformAddr,
      platformFee: event.returnValues._platformFee,
    };

    this.logger.log(`Received OrderFilled Event: ${JSON.stringify(eventInfo)}`);

    const [blockInfo, contractOrderInfo] = await this.web3Service.web3BatchRequest([
      ...this.getBaseBatchRequestParam(event),
      {
        method: this.web3Service.metMarketContractRPC.methods.getOrderById(
          event.returnValues._orderId,
        ).call,
        params: {},
      },
    ]);

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      eventType: OrderEventType.OrderFilled,
      // gasFee: (txInfo.gas * txInfo.gasPrice) / Constants.ELA_ESC_PRECISION,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.orderDataQueue.add(
      'notification',
      {
        orderId: parseInt(eventInfo.orderId),
        address: eventInfo.seller,
        price: parseInt(eventInfo.price),
        royaltyOwner: eventInfo.royaltyOwner,
        royaltyFee: parseInt(eventInfo.royaltyFee),
        buyer: eventInfo.buyer,
        timestamp: orderEvent.timestamp,
      },
      { removeOnComplete: true },
    );

    await this.orderDataQueue.add(
      'update-order-state',
      {
        blockNumber: event.blockNumber,
        orderId: parseInt(eventInfo.orderId),
        orderState: OrderState.Filled,
      },
      { removeOnComplete: true },
    );

    await this.orderDataQueue.add(
      'update-order-buyer',
      {
        blockNumber: event.blockNumber,
        orderId: parseInt(eventInfo.orderId),
        buyer: eventInfo.buyer,
      },
      { removeOnComplete: true },
    );

    await this.subTasksService.updateOrder(parseInt(eventInfo.orderId), {
      orderState: parseInt(contractOrderInfo.orderState),
      buyerAddr: contractOrderInfo.buyerAddr,
      buyerUri: contractOrderInfo.buyerUri,
      filled: parseInt(contractOrderInfo.filled),
      platformAddr: contractOrderInfo.platformAddr,
      platformFee: parseInt(contractOrderInfo.platformFee),
      updateTime: parseInt(contractOrderInfo.updateTime),
      royaltyOwner: eventInfo.royaltyOwner,
      royaltyFee: parseInt(eventInfo.royaltyFee),
    });
  }

  @Timeout('orderCancelled', 60 * 1000)
  async handleOrderCancelledEvent() {
    const nowHeight = await this.web3Service.web3RPC.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(OrderEventType.OrderCancelled);

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync past OrderCancelled events from [${fromBlock}] to [${toBlock}]`);

        this.web3Service.metMarketContractWS
          .getPastEvents('OrderCanceled', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderCancelledEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync past OrderCancelled events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(`Start sync OrderCancelled events from [${syncStartBlock + 1}] 💪💪💪 `);
    this.web3Service.metMarketContractWS.events
      .OrderCanceled({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderCancelledEventData(event);
      });
  }

  private async handleOrderCancelledEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      orderId: event.returnValues._orderId,
    };

    this.logger.log(`Received OrderCancelled Event: ${JSON.stringify(eventInfo)}`);

    const [blockInfo] = await this.web3Service.web3BatchRequest([
      ...this.getBaseBatchRequestParam(event),
    ]);

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      eventType: OrderEventType.OrderCancelled,
      // gasFee: (txInfo.gas * txInfo.gasPrice) / Constants.ELA_ESC_PRECISION,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.orderDataQueue.add(
      'update-order-state',
      {
        blockNumber: event.blockNumber,
        orderId: parseInt(eventInfo.orderId),
        orderState: OrderState.Cancelled,
      },
      { removeOnComplete: true },
    );

    await this.subTasksService.updateOrder(parseInt(eventInfo.orderId), {
      orderState: OrderState.Cancelled,
      updateTime: orderEvent.timestamp,
    });
  }

  @Timeout('orderTakenDown', 60 * 1000)
  async handleOrderTakenDownEvent() {
    const nowHeight = await this.web3Service.web3RPC.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(OrderEventType.OrderTakenDown);

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync past OrderTakenDown events from [${fromBlock}] to [${toBlock}]`);

        this.web3Service.metMarketContractWS
          .getPastEvents('OrderTakenDown', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderTakenDownEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync past OrderTakenDown events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(`Start sync OrderTakenDown events from [${syncStartBlock + 1}] 💪💪💪 `);
    this.web3Service.metMarketContractWS.events
      .OrderTakenDown({
        fromBlock: syncStartBlock,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderTakenDownEventData(event);
      });
  }

  private async handleOrderTakenDownEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      orderId: event.returnValues._orderId,
    };

    this.logger.log(`Received OrderTakenDown Event: ${JSON.stringify(eventInfo)}`);

    const [blockInfo] = await this.web3Service.web3BatchRequest([
      ...this.getBaseBatchRequestParam(event),
    ]);

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      eventType: OrderEventType.OrderTakenDown,
      // gasFee: (txInfo.gas * txInfo.gasPrice) / Constants.ELA_ESC_PRECISION,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.orderDataQueue.add(
      'update-order-state',
      {
        blockNumber: event.blockNumber,
        orderId: parseInt(eventInfo.orderId),
        orderState: OrderState.TakenDown,
      },
      { removeOnComplete: true },
    );

    await this.subTasksService.updateOrder(parseInt(eventInfo.orderId), {
      orderState: OrderState.TakenDown,
      updateTime: orderEvent.timestamp,
    });
  }
}
