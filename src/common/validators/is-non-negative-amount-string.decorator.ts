import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { isValidNonNegativeAmountString } from '../utils/non-negative-number.util';

export function IsNonNegativeAmountString(validationOptions?: ValidationOptions) {
  return function decorate(object: object, propertyName: string) {
    registerDecorator({
      name: 'isNonNegativeAmountString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isValidNonNegativeAmountString(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid non-negative number`;
        },
      },
    });
  };
}
