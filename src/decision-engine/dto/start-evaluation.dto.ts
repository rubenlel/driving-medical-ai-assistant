import { IsString, IsIn, IsNotEmpty } from 'class-validator';

export class StartEvaluationDto {
  @IsString()
  @IsNotEmpty()
  pathology: string;

  @IsString()
  @IsIn(['G1', 'G2'])
  group: 'G1' | 'G2';
}
