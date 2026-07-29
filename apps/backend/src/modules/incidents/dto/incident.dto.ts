import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Impact, Urgency, IncidentState } from '@itsm/db';

export class CreateIncidentDto {
  @ApiProperty({ example: 'VPN Connection Failure' })
  @IsString()
  @IsNotEmpty()
  shortDescription: string;

  @ApiProperty({ example: 'Users in NYC office unable to authenticate to Cisco AnyConnect' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: Impact, example: Impact.DEPARTMENT, required: false })
  @IsOptional()
  impact?: Impact | string;

  @ApiProperty({ enum: Urgency, example: Urgency.HIGH, required: false })
  @IsOptional()
  urgency?: Urgency | string;

  @ApiProperty({ example: 'UNASSIGNED (No Team)', required: false })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({ example: 'UNASSIGNED (Unassigned)', required: false })
  @IsString()
  @IsOptional()
  assignedTo?: string;

  @ApiProperty({ example: 'optional-assigned-user-id', required: false })
  @IsString()
  @IsOptional()
  assignedToId?: string;

  @ApiProperty({ example: 'optional-assignment-group-id', required: false })
  @IsString()
  @IsOptional()
  assignmentGroupId?: string;

  @ApiProperty({ example: 'optional-ci-id', required: false })
  @IsString()
  @IsOptional()
  configurationItemId?: string;

  @ApiProperty({ example: 'System Admin', required: false })
  @IsString()
  @IsOptional()
  caller?: string;

  @ApiProperty({ example: 'Unspecified CI', required: false })
  @IsString()
  @IsOptional()
  configurationItem?: string;

  @ApiProperty({ example: 'Pending Triage', required: false })
  @IsString()
  @IsOptional()
  resolutionCode?: string;

  @ApiProperty({ example: 'Pending triage notes', required: false })
  @IsString()
  @IsOptional()
  resolutionNotes?: string;

  @ApiProperty({ example: 'NEW', required: false })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ example: 'P1', required: false })
  @IsString()
  @IsOptional()
  priority?: string;
}

export class UpdateIncidentDto {
  @ApiProperty({ enum: IncidentState, required: false })
  @IsOptional()
  state?: IncidentState | string;

  @ApiProperty({ enum: Impact, required: false })
  @IsOptional()
  impact?: Impact | string;

  @ApiProperty({ enum: Urgency, required: false })
  @IsOptional()
  urgency?: Urgency | string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  assignedTo?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  assignedToId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  resolutionNotes?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  resolutionCode?: string;

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
  priority?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  configurationItem?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  ci?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  caller?: string;
}

export class AddActivityDto {
  @ApiProperty({ example: 'Checked radius logs, restarting auth service' })
  @IsString()
  @IsNotEmpty()
  comment: string;

  @ApiProperty({ example: true })
  isWorkNote: boolean;
}
