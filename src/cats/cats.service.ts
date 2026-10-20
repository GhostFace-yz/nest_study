import { Injectable } from '@nestjs/common';
import type { Cat } from './interface/cat.interface.js'

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = []

  create(cat: Cat) {
    this.cats.push(cat)
  }

  findAll(): Cat[] {
    return this.cats
  }
}
