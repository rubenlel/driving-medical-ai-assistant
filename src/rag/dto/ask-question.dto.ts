import { IsString, IsNotEmpty, MinLength, IsOptional, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class ConversationMessageDto {
  @IsString()
  role: 'user' | 'assistant';

  @IsString()
  content: string;

  @IsString()
  timestamp: string;
}

class ConversationDto {
  @IsString()
  id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessageDto)
  history: ConversationMessageDto[];

  @IsNumber()
  turn: number;

  @IsString()
  cumulative_context: string;

  @IsOptional()
  cumulative_facts: Record<string, boolean | null> | null;
}

export class AskQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  question: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConversationDto)
  conversation?: ConversationDto;
}
