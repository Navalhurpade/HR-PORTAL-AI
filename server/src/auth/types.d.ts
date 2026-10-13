import '@fastify/jwt';

export type UserRole = 'employee' | 'hr' | 'super_admin';

export interface AuthenticatedUser {
  sub: string;
  role: UserRole;
  name: string;
  email: string;
  department: string;
  managerId: string | null;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthenticatedUser;
    user: AuthenticatedUser;
  }
}
