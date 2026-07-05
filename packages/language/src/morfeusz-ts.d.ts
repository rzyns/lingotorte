declare module '@rzyns/morfeusz-ts' {
  export enum MorfeuszUsage {
    ANALYSE_ONLY = 0,
  }

  export class MorfeuszImpl {
    constructor(dictionaryName: string, usage: MorfeuszUsage);
    load(): Promise<void>;
    preferMatchingCase(): void;
    analyseToArray(text: string): Array<{ orth: string; lemma: string; tag: string }>;
  }
}
