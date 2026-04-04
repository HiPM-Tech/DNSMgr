// Shared TypeScript types

export interface User {
  id: number;
  username: string;
  nickname: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'member';
  status: number;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: number;
  name: string;
  description: string;
  created_by: number;
  created_at: string;
}

export interface TeamMember {
  id: number;
  team_id: number;
  user_id: number;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface DnsAccount {
  id: number;
  type: string;
  name: string;
  config: string; // JSON string
  remark: string;
  created_by: number;
  team_id: number | null;
  created_at: string;
}

export interface Domain {
  id: number;
  account_id: number;
  name: string;
  third_id: string;
  remark: string;
  is_hidden: number;
  record_count: number;
  created_at: string;
}

export interface DomainPermission {
  id: number;
  user_id: number | null;
  team_id: number | null;
  domain_id: number;
  sub: string;
}

export interface OperationLog {
  id: number;
  user_id: number;
  action: string;
  domain: string;
  data: string;
  created_at: string;
}

export interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  msg: string;
}

export interface JwtPayload {
  userId: number;
  username: string;
  nickname?: string;
  role: 'admin' | 'member';
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
