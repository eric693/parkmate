import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface TenantRequest extends Request {
  tenantId?: string;
}

// 車主端 JWT 與業者端分開：payload 帶 kind='tenant'，避免業者 token 能存取車主 API（反之亦然）。
export function requireTenant(req: TenantRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { tenantId: string; kind: string };
    if (payload.kind !== 'tenant') {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    req.tenantId = payload.tenantId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function signTenantToken(tenantId: string): string {
  return jwt.sign({ tenantId, kind: 'tenant' }, config.jwtSecret, { expiresIn: '30d' });
}
