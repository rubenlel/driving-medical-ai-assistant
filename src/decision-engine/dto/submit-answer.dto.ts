import {
  IsString,
  IsNotEmpty,
  IsObject,
  IsArray,
  IsOptional,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

class AnswerPayload {
  @IsString()
  @IsIn(['select', 'yesno', 'checkbox', 'info'])
  type: 'select' | 'yesno' | 'checkbox' | 'info';

  value: boolean | string | string[];

  @IsOptional()
  @IsString()
  precision?: string;
}

class SessionPayload {
  @IsString()
  id: string;

  @IsString()
  pathology: string;

  @IsString()
  @IsIn(['G1', 'G2'])
  groupPermis: 'G1' | 'G2';

  @IsString()
  currentNodeId: string;

  @IsObject()
  facts: Record<string, boolean | null>;

  @IsArray()
  answers: any[];

  @IsArray()
  firedRules: any[];

  @IsString()
  @IsIn(['in_progress', 'completed', 'referred_to_rag'])
  status: string;

  @IsString()
  createdAt: string;
}

export class SubmitAnswerDto {
  @IsObject()
  @ValidateNested()
  @Type(() => SessionPayload)
  session: SessionPayload;

  @IsString()
  @IsNotEmpty()
  node_id: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AnswerPayload)
  answer: AnswerPayload;
}
