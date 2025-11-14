import { customAlphabet } from 'nanoid';

// uuidv4 provides completely random values. (CSPRNG)
// nanoid includes uppercase alphabets, making it more secure (completely random like uuidv4).
// nanoid allows direct length adjustment in the function.
const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  15,
);
export const uid = () => nanoid();
