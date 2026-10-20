import { Body, Controller, Get, Post } from '@nestjs/common';
import type { Cat } from './interface/cat.interface.js';
import { CatsService } from './cats.service.js';
import { CreateCatDto } from './dto/create-dto.js';

@Controller('cats')
export class CatsController {
  constructor(private catsService: CatsService) {

  }

  @Post()
  async create(@Body() createCatDto: CreateCatDto) {
    this.catsService.create(createCatDto);
  }

  @Get()
  async findAll(): Promise<Cat[]> {
    return this.catsService.findAll();
  }
}