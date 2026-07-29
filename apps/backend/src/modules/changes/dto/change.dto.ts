import { IsNotEmpty, IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChangeDto {
  @ApiProperty({ example: 'Upgrade Production BGP Edge Router Firmware to v15.4' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Scheduled patch upgrade to resolve latency bugs on NYC datacenter switch router-border-nyc-01.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'NORMAL', enum: ['STANDARD', 'NORMAL', 'EMERGENCY'], required: false })
  @IsString()
  @IsOptional()
  changeType?: string;

  @ApiProperty({ example: 'router-border-nyc-01', required: false })
  @IsString()
  @IsOptional()
  configurationItem?: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 5, required: false })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  riskScore?: number;

  @ApiProperty({ example: '2026-08-01T20:00:00.000Z', required: false })
  @IsString()
  @IsOptional()
  plannedStartDate?: string;

  @ApiProperty({ example: '2026-08-01T23:00:00.000Z', required: false })
  @IsString()
  @IsOptional()
  plannedEndDate?: string;

  @ApiProperty({ example: 'Apply vendor firmware image, run checksum validation, reboot active engine node.', required: false })
  @IsString()
  @IsOptional()
  implementationPlan?: string;

  @ApiProperty({ example: 'Revert to Dual OS Partition B image and restore BGP routing config from snapshot.', required: false })
  @IsString()
  @IsOptional()
  backoutPlan?: string;
}

export class UpdateChangeDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, enum: ['DRAFT', 'ASSESS', 'AUTHORIZE', 'SCHEDULED', 'IMPLEMENTATION', 'REVIEW', 'CLOSED', 'CANCELLED'] })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ required: false, enum: ['NOT_REQUESTED', 'REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'] })
  @IsString()
  @IsOptional()
  approvalState?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  changeType?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  riskScore?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  configurationItem?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  assignedTo?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  implementationPlan?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  backoutPlan?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  cabNotes?: string;
}
