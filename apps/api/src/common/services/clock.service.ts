import { Injectable } from '@nestjs/common';

// Injected so tests can control the current time.
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
