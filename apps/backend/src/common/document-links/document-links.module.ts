import { Module } from '@nestjs/common';
import { DocumentObjectStorageService } from './document-object-storage.service';
import { DocumentLinksService } from './document-links.service';

@Module({
  providers: [DocumentLinksService, DocumentObjectStorageService],
  exports: [DocumentLinksService, DocumentObjectStorageService],
})
export class DocumentLinksModule {}
