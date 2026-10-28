export interface AuthSession {
  /** Sem contas individuais por enquanto (decisão da liderança): apenas "ADM". */
  adminAlias: string;
  authenticatedAt: string;
}

export interface AuthResult {
  ok: boolean;
  session?: AuthSession | undefined;
  errorMessage?: string | undefined;
}

/**
 * Interface de autenticação do painel administrativo.
 * Permite substituir a validação local mock por um cliente de autenticação real no futuro.
 */
export interface AuthProvider {
  login(password: string): Promise<AuthResult>;
  logout(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
}

// TODO(auth): substituir o MockAuthProvider por verificação real feita pelo Host
// (senha de administração definida no Host; o Controller nunca decide sozinho).
// Este mock é SOMENTE para demonstração de interface e NÃO oferece segurança alguma.
export class MockAuthProvider implements AuthProvider {
  private currentSession: AuthSession | null = null;
  private readonly demoPasscode = 'aeroclan-admin';

  public async login(password: string): Promise<AuthResult> {
    const normalized = password.trim();
    if (!normalized) {
      return { ok: false, errorMessage: 'Informe a senha de administração para acessar o painel.' };
    }

    if (normalized !== this.demoPasscode) {
      return { ok: false, errorMessage: 'Senha inválida. No modo demonstração use "aeroclan-admin".' };
    }

    this.currentSession = { adminAlias: 'ADM', authenticatedAt: new Date().toISOString() };
    return { ok: true, session: this.currentSession };
  }

  public async logout(): Promise<void> {
    this.currentSession = null;
  }

  public async getSession(): Promise<AuthSession | null> {
    return this.currentSession;
  }
}

export const defaultAuthProvider: AuthProvider = new MockAuthProvider();
