import { Background, Bar, Icon, Text } from '.';

const creator = {
  background: Background,
  bar: Bar,
  icon: Icon,
  text: Text,
};

export const newComponent = (type, context) => new creator[type](context);
