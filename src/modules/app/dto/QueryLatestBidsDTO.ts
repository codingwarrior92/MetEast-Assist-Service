import { IsNotEmpty, Min } from 'class-validator';

export class QueryLatestBidsDTO {
  @IsNotEmpty()
  tokenId: string;
  @Min(1)
  pageSize: number;
  @Min(1)
  pageNum: number;
}
