import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { CommonResponse } from '../utils/interfaces';
import { QueryLatestBidsDTO } from './dto/QueryLatestBidsDTO';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/check')
  async check(): Promise<CommonResponse> {
    return await this.appService.check();
  }

  @Get('/getCollectibleByTokenId')
  async getCollectibleByTokenId(@Query('tokenId') tokenId: string): Promise<CommonResponse> {
    return await this.appService.getCollectibleByTokenId(tokenId);
  }

  @Get('/getTokenOrderByTokenId')
  async getTokenOrderByTokenId(@Query('tokenId') tokenId: string): Promise<CommonResponse> {
    return await this.appService.getTokenOrderByTokenId(tokenId);
  }

  @Get('/getTransHistoryByTokenId')
  async getTransHistoryByTokenId(@Query('tokenId') tokenId: string): Promise<CommonResponse> {
    return await this.appService.getTransHistoryByTokenId(tokenId);
  }

  @Post('/getLatestBids')
  async getLatestBids(@Body() dto: QueryLatestBidsDTO): Promise<CommonResponse> {
    return await this.appService.getLatestBids(dto);
  }

  @Get('/getEarnedByAddress')
  async getEarnedByAddress(@Query('address') address: string): Promise<CommonResponse> {
    return await this.appService.getEarnedByAddress(address, false, false);
  }

  @Get('/getTodayEarnedByAddress')
  async getTodayEarnedByAddress(@Query('address') address: string): Promise<CommonResponse> {
    return await this.appService.getEarnedByAddress(address, true, false);
  }

  @Get('/getEarnedListByAddress')
  async getEarnedListByAddress(@Query('address') address: string): Promise<CommonResponse> {
    return await this.appService.getEarnedByAddress(address, false, true);
  }

  @Get('/getTokenPriceHistory')
  async getTokenPriceHistory(@Query('tokenId') tokenId: string): Promise<CommonResponse> {
    return await this.appService.getTokenPriceHistory(tokenId);
  }
}
