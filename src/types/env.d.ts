declare module '@env' {
  export const GOOGLE_MAPS_API_KEY: string | undefined;
}

declare const process: {
  env: Record<string, string | undefined>;
};
