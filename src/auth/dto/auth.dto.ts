import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class JwtPayload {
  @ApiProperty()
  sub!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ required: false })
  iat?: number;

  @ApiProperty({ required: false })
  exp?: number;
}
