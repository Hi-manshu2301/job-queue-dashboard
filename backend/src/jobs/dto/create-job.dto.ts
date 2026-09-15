import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty({ message: 'title must not be empty' })
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'type must not be empty' })
  @MinLength(1)
  @MaxLength(100)
  type: string;
}
