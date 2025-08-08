import { Request, Response, NextFunction } from 'express';
import prisma from '@/lib/prisma';
import { UserCreateInput } from '@/models/user.types'; // Assuming you created this
import { hashPassword as utilHashPassword } from '@/lib/auth.utils'; // Alias to avoid conflict

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, phone, role, password  } = req.body as UserCreateInput;

    if (!name || !phone || !role || !password ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const passwordHash = await utilHashPassword(password); // Hash it here

    const newUser = await prisma.user.create({
      data: {
        name,
        phone,
        role,
        passwordHash, // Note: Password should be hashed before this point in a real app
      },
    });
    
    const { passwordHash: _, ...userWithoutPassword } = newUser;
    return res.status(201).json(userWithoutPassword);
  } catch (error: any) {
    if (error.code === 'P2002' && error.meta?.target?.includes('phone')) {
      return res.status(409).json({ message: 'Phone number already exists' });
    }
    next(error);
  }
};

export const getUserById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const { passwordHash, ...userWithoutPasswordHash } = user;
    return res.status(200).json(userWithoutPasswordHash);
  } catch (error) {
    next(error);
  }
};