import { v4 as uuidv4 } from 'uuid';

export const createUUID = () => uuidv4().split('-').slice(0, 2).join('');
