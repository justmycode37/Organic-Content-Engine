declare module 'virtual:assets' {
  export const ASSETS: Record<string, { type: string; encoding: 'utf8' | 'base64'; body: string }>;
}
