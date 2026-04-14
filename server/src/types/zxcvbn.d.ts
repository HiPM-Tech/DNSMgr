declare module 'zxcvbn' {
  interface ZXCVBNResult {
    score: number;
    feedback: {
      warning: string;
      suggestions: string[];
    };
  }
  function zxcvbn(password: string, userInputs?: string[]): ZXCVBNResult;
  export = zxcvbn;
}
