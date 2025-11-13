import { customAlphabet } from 'nanoid';

// uuidv4 provides completely random values. (CSPRNG)
// nanoid includes uppercase alphabets, making it more secure (completely random like uuidv4).
// nanoid allows direct length adjustment in the function.
export const uid = () =>
  customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    15,
  )();
