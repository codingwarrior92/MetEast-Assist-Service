import mongoose, { Connection, Model } from 'mongoose';

export const TokenEventSchema = new mongoose.Schema(
  {
    blockNumber: Number,
    transactionHash: String,
    from: String,
    to: String,
    tokenId: String,
    gasFee: Number,
    timestamp: Number,
  },
  { versionKey: false },
);

export function getTokenEventModel(connection: Connection): Model<any> {
  return connection.model('token_events', TokenEventSchema);
}
