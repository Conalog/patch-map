import { registerElement } from './creator';
import { Grid } from './Grid';
import { Group } from './Group';
import { Image } from './Image';
import { Item } from './Item';
import { Relations } from './Relations';
import { Text } from './Text';

registerElement('group', Group);
registerElement('grid', Grid);
registerElement('item', Item);
registerElement('relations', Relations);
registerElement('image', Image);
registerElement('text', Text);
