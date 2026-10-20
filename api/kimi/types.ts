export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export type SessionPayload = {
  unionId: string;
  clientId: string;
  // С2/security-audit-11-09.md: значение sessionVersion пользователя на
  // момент выдачи токена — см. db/schema.ts users.sessionVersion.
  sessionVersion: number;
};

export type UserProfile = {
  user_id: string;
  name: string;
  avatar_url: string;
};
