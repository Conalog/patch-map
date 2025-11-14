import { customAlphabet } from 'nanoid';

// uuidv4 provides completely random values. (CSPRNG)
// nanoid includes uppercase alphabets, making it more secure (completely random like uuidv4).
// nanoid allows direct length adjustment in the function.
const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const nanoid = customAlphabet(ALPHABET, 15);

export const uid = () => nanoid();
