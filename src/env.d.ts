/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module 'set-cookie-parser';

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}
declare const process: {
  env: NodeJS.ProcessEnv;
};
