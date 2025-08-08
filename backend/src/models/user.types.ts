import { Role } from '@prisma/client';

export interface UserCreateInput {
  name: string;
  phone: string;
  role: Role;
  password: string; // In a real app, this would be hashed by the service/controller
}