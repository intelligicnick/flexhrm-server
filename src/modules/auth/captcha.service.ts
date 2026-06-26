import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface CaptchaChallenge {
  id: string;
  question: string;
}

@Injectable()
export class CaptchaService {
  createChallenge(): CaptchaChallenge {
    const a = crypto.randomInt(1, 11);
    const b = crypto.randomInt(1, 11);
    return { id: `math:${a}+${b}`, question: `${a} + ${b} = ?` };
  }

  verify(id: string, userAnswer: string): boolean {
    const trimmedAnswer = userAnswer.trim();
    if (!trimmedAnswer || !/^\d+$/.test(trimmedAnswer)) return false;

    const mathMatch = /^math:(\d+)\+(\d+)$/.exec(id.trim());
    if (!mathMatch) return false;

    const expected = Number(mathMatch[1]) + Number(mathMatch[2]);
    const answer = Number(trimmedAnswer);
    return Number.isInteger(answer) && answer === expected;
  }
}
