export interface ContractTokenInfo {
  tokenId: string;
  tokenIndex: number;
  tokenOwner: string;
  tokenUri: string;
  royaltyOwner: string;
  royaltyFee: number;
  tokenMinter: string;
  createTime: number;
  updateTime: number;
}

export interface ContractOrderInfo {
  orderId: number;
  orderType: OrderType;
  orderState: OrderState;
  tokenId: string;
  quoteToken: string;
  price: number;
  endTime: number;
  sellerAddr: string;
  buyerAddr: string;
  bids: number;
  lastBidder: string;
  lastBid: number;
  filled: number;
  royaltyOwner: string;
  royaltyFee: number;
  sellerUri: string;
  buyerUri: string;
  platformAddr: string;
  platformFee: number;
  isBlindBox: boolean;
  createTime: number;
  updateTime: number;
}

export interface ContractUserInfo {
  did: string;
  description: string;
  name: string;
}

interface TokenData {
  image: string;
  kind: string;
  size: number;
  thumbnail: string;
}

export interface IPFSTokenInfo {
  version: number;
  type: string;
  name: string;
  description: string;
  creator: ContractUserInfo;
  data: TokenData;
  category: string;
}

export enum OrderEventType {
  OrderForAuction,
  OrderBid,
  OrderForSale,
  OrderFilled,
  OrderCancelled,
  OrderPriceChanged,
  OrderTakenDown,
}

export enum OrderType {
  Sale = 1,
  Auction,
}

export enum OrderState {
  Created = 1,
  Filled,
  Cancelled,
  TakenDown,
}
