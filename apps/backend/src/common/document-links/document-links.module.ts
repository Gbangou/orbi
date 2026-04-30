import { Module } from '@nestjs/common';
import { DocumentLinksService } from './document-links.service';

@Module({
  providers: [DocumentLinksService],
  exports: [DocumentLinksService],
})
export class DocumentLinksModule {}
