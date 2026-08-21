import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'Venu' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'admin007' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RegisterTenantDto {
  @ApiProperty({ example: 'Acme Corporation' })
  @IsString()
  @IsNotEmpty()
  organizationName: string;

  @ApiProperty({ example: 'acme.com' })
  @IsString()
  @IsNotEmpty()
  domain: string;

  @ApiProperty({ example: 'admin@acme.com' })
  @IsEmail()
  @IsNotEmpty()
  adminEmail: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  adminPassword: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  adminFirstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  adminLastName: string;
}
