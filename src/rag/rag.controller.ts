import { Body, Controller, Post } from '@nestjs/common';
import { RagService } from './rag.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { RagResponse } from './interfaces/rag-response.interface';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('ask')
  async ask(@Body() dto: AskQuestionDto): Promise<RagResponse> {
    return this.ragService.ask(dto.question);
  }
}
