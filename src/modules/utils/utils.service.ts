import { Injectable } from '@nestjs/common';

@Injectable()
export class UtilsService {}

export const Sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
