import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private client: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const url = this.configService.getOrThrow<string>('supabase.url');
    const anonKey = this.configService.getOrThrow<string>('supabase.anonKey');

    this.client = createClient(url, anonKey);
    this.logger.log('Supabase client initialized');
  }

  getClient(): SupabaseClient {
    return this.client;
  }
}
