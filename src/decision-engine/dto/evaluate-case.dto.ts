import { IsString, IsIn, IsObject } from 'class-validator';

export class EvaluateCaseDto {
  @IsString()
  pathology: string;

  @IsString()
  @IsIn(['G1', 'G2'])
  group: 'G1' | 'G2';

  @IsObject()
  facts: Record<string, boolean | null>;
}
