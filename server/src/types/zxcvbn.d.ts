declare module 'zxcvbn' {
  interface ZXCVBNFeedback {
    warning: string;
    suggestions: string[];
  }

  interface ZXCVBNResult {
    score: number;
    feedback: ZXCVBNFeedback;
    crack_times_display: {
      offline_slow_hashing_1e4_per_second: string;
      offline_fast_hashing_1e10_per_second: string;
      online_no_throttling_10_per_second: string;
      online_throttling_100_per_hour: string;
    };
  }
  function zxcvbn(password: string, userInputs?: string[]): ZXCVBNResult;
  export = zxcvbn;
}
