import { Grid, Group, Item, Relations } from '.';

const creator = {
  group: Group,
  grid: Grid,
  item: Item,
  relations: Relations,
};

export const newElement = (type, context) => new creator[type](context);
