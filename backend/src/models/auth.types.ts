// src/models/auth.types.ts
import { Role } from '.prisma/client';

export interface LoginPayload {
    phone: string;
    password: string;
}

export interface JwtPayload {
    userId: string;
    role: Role;
    phone?: string;
} 