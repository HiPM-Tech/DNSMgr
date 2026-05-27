declare module 'punycode.js' {
  export function encode(input: string): string;
  export function decode(input: string): string;
  export function toASCII(input: string): string;
  export function toUnicode(input: string): string;
  
  const punycode: {
    encode: typeof encode;
    decode: typeof decode;
    toASCII: typeof toASCII;
    toUnicode: typeof toUnicode;
  };
  
  export default punycode;
}
