import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { openaiConfig, supabaseConfig } from './config/env.config';
import { SupabaseModule } from './supabase/supabase.module';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [openaiConfig, supabaseConfig],
      envFilePath: '.env',
    }),
    SupabaseModule,
    RagModule,
  ],
})
export class AppModule {}
