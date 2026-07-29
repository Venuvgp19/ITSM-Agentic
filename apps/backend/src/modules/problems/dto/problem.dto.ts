import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProblemDto {
  @ApiProperty({ example: 'Recurring PostgreSQL Connection Pool Exhaustion' })
  @IsString()
  @IsNotEmpty()
  shortDescription: string;

  @ApiProperty({ example: 'Primary DB host postgres-prod-01 experiences thread lock up every 12 hours.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'postgres-prod-01', required: false })
  @IsString()
  @IsOptional()
  configurationItem?: string;

  @ApiProperty({ example: 'P1', required: false })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiProperty({ example: 'NEW', required: false })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ example: 'Unoptimized long-running query locks connection pool max limits.', required: false })
  @IsString()
  @IsOptional()
  rootCause?: string;

  @ApiProperty({ example: 'Run `pg_terminate_backend` on idle PID sessions.', required: false })
  @IsString()
  @IsOptional()
  workaround?: string;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  knownError?: boolean;
}

export class UpdateProblemDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  shortDescription?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  rootCause?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  workaround?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  knownError?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  configurationItem?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  assignedTo?: string;
}
