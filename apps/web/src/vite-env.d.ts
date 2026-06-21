/// <reference types="vite/client" />

declare module '*.srt?raw' {
  const content: string;
  export default content;
}

declare module '*.webm?url' {
  const url: string;
  export default url;
}
