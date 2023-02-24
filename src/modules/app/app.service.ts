import { BadRequestException, CACHE_MANAGER, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Web3Service } from '../utils/web3.service';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../database/db.service';
import { Constants } from '../../constants';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Cache } from 'cache-manager';
import { OrderEventType, OrderState, OrderType } from '../tasks/interfaces';
import { QueryLatestBidsDTO } from './dto/QueryLatestBidsDTO';

@Injectable()
export class AppService {
  constructor(
    private web3Service: Web3Service,
    private configService: ConfigService,
    private dbService: DbService,
    @InjectConnection() private readonly connection: Connection,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async check() {
    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS };
  }

  async getCollectibleByTokenId(tokenId: string) {
    const data = await this.connection.collection('tokens').findOne({ tokenId });

    if (data) {
      const authorData = await this.cacheManager.get(data.royaltyOwner.toLowerCase());
      if (authorData) {
        data.authorAvatar = JSON.parse(authorData as string).avatar;
      }

      const ownerData = await this.cacheManager.get(data.tokenOwner.toLowerCase());
      if (ownerData) {
        data.holderName = JSON.parse(ownerData as string).name;
      }
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getTokenOrderByTokenId(tokenId: string) {
    const result = await this.connection
      .collection('tokens')
      .aggregate([
        { $match: { tokenId } },
        {
          $lookup: {
            from: 'token_events',
            let: { tokenId: '$tokenId' },
            pipeline: [
              {
                $match: { $expr: { $eq: ['$tokenId', '$$tokenId'] }, from: Constants.BURN_ADDRESS },
              },
              { $sort: { blockNumber: -1 } },
              { $group: { _id: '$tokenId', doc: { $first: '$$ROOT' } } },
              { $replaceRoot: { newRoot: '$doc' } },
              { $project: { _id: 0, transactionHash: 1 } },
            ],
            as: 'tokenEvent',
          },
        },
        { $unwind: { path: '$tokenEvent', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'orders',
            let: { tokenId: '$tokenId' },
            pipeline: [
              { $sort: { createTime: -1 } },
              { $group: { _id: '$tokenId', doc: { $first: '$$ROOT' } } },
              { $replaceRoot: { newRoot: '$doc' } },
              { $match: { $expr: { $eq: ['$tokenId', '$$tokenId'] } } },
              { $project: { _id: 0, tokenId: 0 } },
            ],
            as: 'order',
          },
        },
        { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
      ])
      .toArray();

    let data;
    if (result.length > 0) {
      data = result[0];
      const authorData = await this.cacheManager.get(data.royaltyOwner.toLowerCase());
      if (authorData) {
        data.authorAvatar = JSON.parse(authorData as string).avatar;
      }
    } else {
      data = {} as any;
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getLatestBids(dto: QueryLatestBidsDTO) {
    const order = await this.connection
      .collection('orders')
      .findOne(
        { tokenId: dto.tokenId, orderType: OrderType.Auction },
        { sort: { createTime: -1 } },
      );

    if (!order) {
      throw new BadRequestException('No auction order found');
    }

    const filter = { orderId: order.orderId, eventType: OrderEventType.OrderBid };

    const total = await this.connection.collection('order_events').count(filter);
    let data = [];

    if (total > 0) {
      data = await this.connection
        .collection('order_events')
        .find(filter)
        .sort({ blockNumber: -1 })
        .project({ _id: 0, transactionHash: 0 })
        .skip((dto.pageNum - 1) * dto.pageSize)
        .limit(dto.pageSize)
        .toArray();

      for (const item of data) {
        const userData = await this.cacheManager.get(item.buyer.toLowerCase());
        if (userData) {
          item.buyerName = JSON.parse(userData as string).name;
        }
      }
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { total, data } };
  }

  async getTransHistoryByTokenId(tokenId: string) {
    const data = await this.connection
      .collection('orders')
      .aggregate([
        { $match: { tokenId } },
        { $sort: { updateTime: -1 } },
        {
          $lookup: {
            from: 'order_events',
            localField: 'orderId',
            foreignField: 'orderId',
            as: 'events',
          },
        },
        {
          $project: {
            _id: 0,
            'events._id': 0,
            'events.tokenId': 0,
            tokenId: 0,
            quoteToken: 0,
            royaltyOwner: 0,
            royaltyFee: 0,
            sellerUri: 0,
            buyerUri: 0,
            platformFee: 0,
            platformAddr: 0,
          },
        },
      ])
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getEarnedByAddress(address: string, isToday: boolean, isReturnList: boolean) {
    const match = {
      orderState: OrderState.Filled,
      $or: [{ royaltyOwner: address }, { sellerAddr: address }],
    };

    if (isToday) {
      match['updateTime'] = {
        $gte: new Date().setHours(0, 0, 0) / 1000,
        $lte: new Date().setHours(23, 59, 59) / 1000,
      };
    }

    const items = await this.connection
      .collection('orders')
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'tokens',
            localField: 'tokenId',
            foreignField: 'tokenId',
            as: 'token',
          },
        },
        { $unwind: { path: '$token' } },
        {
          $project: {
            _id: 0,
            orderType: 1,
            orderState: 1,
            price: 1,
            sellerAddr: 1,
            filled: 1,
            royaltyOwner: 1,
            royaltyFee: 1,
            platformFee: 1,
            updateTime: 1,
            'token.name': 1,
            'token.data.thumbnail': 1,
          },
        },
        { $sort: { updateTime: -1 } },
      ])
      .toArray();

    if (isReturnList) {
      return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: items };
    }

    let data = 0;
    items.forEach((item) => {
      if (item.royaltyOwner === address) {
        if (item.sellerAddr === address) {
          data += (item.orderType === OrderType.Sale ? item.price : item.filled) - item.platformFee;
        } else {
          data += item.royaltyFee;
        }
      } else {
        data +=
          (item.orderType === OrderType.Sale ? item.price : item.filled) -
          item.platformFee -
          item.royaltyFee;
      }
    });

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getTokenPriceHistory(tokenId: string) {
    const data = await this.connection
      .collection('orders')
      .find({ tokenId, orderState: OrderState.Filled })
      .sort({ updateTime: 1 })
      .project({ _id: 0, updateTime: 1, price: '$filled' })
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async test() {
    // this.web3Service.web3RPC.eth.getBlockNumber().then((number) => {
    //   console.log(number);
    //   console.log(typeof number);
    // });
    // const result = await this.web3Service.web3BatchRequest([
    //   {
    //     method: this.web3Service.metContractRPC.methods.tokenInfo(
    //       '103244789162639796336139546484767475042549830186784659157413781488168484689769',
    //     ).call,
    //     params: {},
    //   },
    // ]);
    // console.log(result);
    // this.web3Service.metMarketContractRPC.methods.getOrderById(196).call({}).then(console.log);
    //   this.web3Service.metMarketContractWS.events
    //     .OrderTakenDown({
    //       fromBlock: 0,
    //     })
    //     .on('data', console.log);
    // this.web3Service.metContractWS
    //   .getPastEvents('Transfer', {
    //     fromBlock: 12388014,
    //     toBlock: 'latest',
    //   })
    //   .then(console.log);
  }
}
