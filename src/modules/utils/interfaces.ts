export interface CallOfBatch {
  method: any;
  params: any;
}

export interface CommonResponse {
  status: number;
  message: string;
  data?: any;
}
