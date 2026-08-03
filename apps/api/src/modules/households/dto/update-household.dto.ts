import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateHouseholdDto {
  @ApiProperty({
    example: '我们的家',
    minLength: 1,
    maxLength: 40,
    description: '1–40 Unicode code points after trim and NFC normalization.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().normalize('NFC') : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}
