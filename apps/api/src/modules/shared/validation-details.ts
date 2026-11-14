import type { ValidationError } from 'class-validator';

/**
 * Flattens class-validator errors into `{ field, codes }` details. A nested DTO
 * reports its failures on children, so the path is kept dotted
 * (`recurrence.byWeekday`), the same form the services use and the client maps
 * to a form field.
 */
export function validationDetails(errors: ValidationError[], prefix = ''): Array<{ field: string; codes: string[] }> {
  return errors.flatMap((error) => {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    const nested = validationDetails(error.children ?? [], field);
    if (error.constraints === undefined) return nested.length > 0 ? nested : [{ field, codes: [] }];
    return [{ field, codes: Object.keys(error.constraints).sort() }, ...nested];
  });
}
