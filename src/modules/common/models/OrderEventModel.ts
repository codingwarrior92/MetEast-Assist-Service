import mongoose, { Connection, Model } from 'mongoose';

export const OrderEventSchema = new mongoose.Schema(
  {
    blockNumber: Number,
    transactionHash: String,
    seller: String,
    buyer: String,
    orderId: Number,
    tokenId: String,
    quoteToken: String,
    minPrice: Number,
    price: Number,
    oldPrice: Number,
    newPrice: Number,
    endTime: Number,
    royaltyOwner: String,
    royaltyFee: Number,
    platformAddress: String,
    platformFee: Number,
    eventType: Number,
    gasFee: Number,
    timestamp: Number,
  },
  { versionKey: false },
);

export function getOrderEventModel(connection: Connection): Model<any> {
  return connection.model('order_events', OrderEventSchema);
}
