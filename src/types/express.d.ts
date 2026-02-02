import { AuthenticatedCustomer } from '../auth/interfaces/api-guard.interface';

declare global {
  namespace Express {
    interface Request {
      customer?: AuthenticatedCustomer;
    }
  }
}

export {};
