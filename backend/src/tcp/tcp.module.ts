import { Module } from '@nestjs/common';
import { TcpGateway } from './tcp.gateway';

@Module({
  providers: [TcpGateway],
})
export class TcpModule {} 