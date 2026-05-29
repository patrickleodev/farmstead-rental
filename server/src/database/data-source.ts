import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from './typeorm.config';

export default new DataSource(getDataSourceOptions());
