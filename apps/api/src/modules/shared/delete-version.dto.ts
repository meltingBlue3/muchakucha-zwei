import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, ValidateIf } from 'class-validator';

/**
 * The version a delete was confirmed against. Optional, so app builds released
 * before deletes were checked keep working; when sent, a stale delete returns
 * 409 EDIT_CONFLICT just as a stale save does.
 */
export class DeleteVersionQueryDto {
  @ApiPropertyOptional({ description: 'Version read before deleting; a stale delete returns 409 EDIT_CONFLICT. Omitted, the delete is not checked.' })
  @ValidateIf((query: DeleteVersionQueryDto) => query.expectedUpdatedAt !== undefined || query.expectedRuleUpdatedAt !== undefined)
  @IsDateString()
  expectedUpdatedAt?: string;

  @ApiPropertyOptional({ description: 'With expectedUpdatedAt, required for a recurring occurrence.' })
  @IsOptional() @IsDateString()
  expectedRuleUpdatedAt?: string;
}

export function deletePrecondition(query: DeleteVersionQueryDto): { expectedUpdatedAt: string; expectedRuleUpdatedAt?: string } | undefined {
  if (query.expectedUpdatedAt === undefined) return undefined;
  return query.expectedRuleUpdatedAt === undefined
    ? { expectedUpdatedAt: query.expectedUpdatedAt }
    : { expectedUpdatedAt: query.expectedUpdatedAt, expectedRuleUpdatedAt: query.expectedRuleUpdatedAt };
}
