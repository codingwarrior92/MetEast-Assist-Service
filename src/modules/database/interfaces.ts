import { ContractUserInfo, OrderState } from '../tasks/interfaces';

export interface UpdateOrderParams {
  price?: number;
  updateTime?: number;
  orderState?: OrderState;
  buyerInfo?: ContractUserInfo;
  buyerUri?: string;
  filled?: number;
  buyerAddr?: string;
  platformAddr?: string;
  platformFee?: number;
  bids?: number;
  lastBid?: number;
  lastBidder?: string;
  royaltyOwner?: string;
  royaltyFee?: number;
}
