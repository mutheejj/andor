declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (
          prompt: string | Array<{ role: string; content: unknown }>,
          options?: {
            model?: string;
            stream?: boolean;
          },
        ) => Promise<unknown>;
      };
      auth?: {
        isSignedIn: () => boolean;
        signIn: (options?: { attempt_temp_user_creation?: boolean }) => Promise<unknown>;
        signOut: () => void;
        getUser: () => Promise<{ username?: string; email?: string }>;
        setToken?: (token: string) => void;
      };
      ui?: {
        authenticateWithPuter: () => Promise<void>;
      };
      env?: string;
    };
  }
}

let puterAuthToken: string | null = null;

export function setAuthToken(token: string | null): void {
  puterAuthToken = token;
  
  // Also set token in Puter.js if available
  const puter = getPuter();
  if (puter?.auth?.setToken && token) {
    try {
      puter.auth.setToken(token);
    } catch {
      // ignore
    }
  }
  
  try {
    if (token) {
      window.localStorage.setItem('puterAuthToken', token);
    } else {
      window.localStorage.removeItem('puterAuthToken');
    }
  } catch {
    // ignore
  }
}

export function getAuthToken(): string | null {
  if (puterAuthToken) return puterAuthToken;
  try {
    const v = window.localStorage.getItem('puterAuthToken');
    if (v) puterAuthToken = v;
  } catch {
    // ignore
  }
  return puterAuthToken;
}

export function getPuter() {
  if (typeof window !== 'undefined' && window.puter) {
    return window.puter;
  }
  return null;
}

export function isSignedIn(): boolean {
  return Boolean(getAuthToken());
}

export async function getUser(): Promise<{ username?: string; email?: string } | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const resp = await fetch('https://api.puter.com/whoami', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) {
      return null;
    }
    const data = (await resp.json()) as any;
    return {
      username: data?.username,
      email: data?.email,
    };
  } catch {
    return null;
  }
}

export async function signIn(): Promise<boolean> {
  // In VS Code webviews, Puter popup-based auth is blocked by iframe sandbox.
  // Sign-in is handled by the extension host (opens external browser + returns token).
  return false;
}

export function signOut(): void {
  setAuthToken(null);
}

export interface StreamMessage {
  text?: string;
  toString?: () => string;
}

export async function streamChat(
  messages: Array<{ role: string; content: unknown }>,
  model: string,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: string) => void,
): Promise<void> {
  if (typeof window === 'undefined') {
    onError('Not in browser environment');
    return;
  }

  const token = getAuthToken();
  if (!token) {
    onError('Not signed in. Click Sign in to authenticate with Puter.');
    return;
  }

  // Map our model names to Puter's OpenAI-compatible model names
  const modelMap: Record<string, string> = {
    'claude-sonnet-4': 'claude-sonnet-4-20250514',
    'claude-opus-4': 'claude-opus-4-20250514',
    'claude-haiku-4': 'claude-haiku-4-20250514',
    'gpt-4o': 'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
    'gpt-4-1': 'gpt-4.1',
    'o3-mini': 'o3-mini',
    'gemini-2-5-pro': 'gemini-2.5-pro',
    'gemini-2-5-flash': 'gemini-2.5-flash',
    'deepseek-v3': 'deepseek-chat',
    'deepseek-r1': 'deepseek-reasoner',
    'llama-4-maverick': 'llama-4-maverick',
    'llama-4-scout': 'llama-4-scout',
    'mistral-large': 'mistral-large-latest',
  };
  
  const apiModel = modelMap[model] || model;

  try {
    const resp = await fetch('https://api.puter.com/puterai/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: apiModel,
        stream: true,
        messages: messages.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 401) {
        onError('Session expired. Please click Sign in again.');
        return;
      }
      if (resp.status === 402) {
        try {
          const errorData = JSON.parse(text);
          if (errorData.code === 'insufficient_funds') {
            onError('Puter account has no usage left. Please add credits at puter.com or try a free model.');
            return;
          }
        } catch {
          // ignore JSON parse error
        }
        onError('Payment required. Please add credits to your Puter account.');
        return;
      }
      // Log detailed error for debugging
      console.error('[Andor] API error:', resp.status, text);
      onError(`HTTP ${resp.status}: ${text || resp.statusText}`);
      return;
    }

    if (!resp.body) {
      onError('No response body');
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // OpenAI-style SSE: lines starting with "data: "
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trimEnd();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice('data:'.length).trim();
        if (!data) continue;
        if (data === '[DONE]') {
          onDone(fullText);
          return;
        }
        try {
          const json = JSON.parse(data) as any;
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            fullText += delta;
            onChunk(fullText);
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    onDone(fullText);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[PuterCoder] streamChat error:', err);
    onError(`Error: ${errorMsg}`);
  }
}
