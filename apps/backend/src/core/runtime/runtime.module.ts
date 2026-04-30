import { Global, Module } from '@nestjs/common';
import { AppLifecycleService } from './app-lifecycle.service';
import { FeatureFlagsService } from './feature-flags.service';

@Global()
@Module({
  providers: [AppLifecycleService, FeatureFlagsService],
  exports: [AppLifecycleService, FeatureFlagsService],
})
export class RuntimeModule {}
