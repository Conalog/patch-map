import { registerElement } from './creator';
import { Grid } from './Grid';
import { Group } from './Group';
import { Image } from './Image';
import { Item } from './Item';
import { Relations } from './Relations';

registerElement('group', Group);
registerElement('grid', Grid);
registerElement('item', Item);
registerElement('relations', Relations);
registerElement('image', Image);
