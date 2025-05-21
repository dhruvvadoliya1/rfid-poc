import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TcpModule } from './tcp/tcp.module';

@Module({
  imports: [TcpModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
