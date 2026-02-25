import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class AskQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  question: string;
}
