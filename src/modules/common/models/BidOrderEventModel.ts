import mongoose, { Connection, Model } from 'mongoose';

export const BidOrderEventSchema = new mongoose.Schema(
  {
    blockNumber: Number,
    transactionHash: String,
    seller: String,
    buyer: String,
    orderId: Number,
    price: Number,
    gasFee: Number,
    timestamp: Number,
  },
  { versionKey: false },
);

export function getBidOrderEventModel(connection: Connection): Model<any> {
  return connection.model('bid_order_events', BidOrderEventSchema);
}
