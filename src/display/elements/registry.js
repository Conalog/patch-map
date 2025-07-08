import { Grid } from './Grid';
import { Group } from './Group';
import { Item } from './Item';
import { Relations } from './Relations';
import { registerElement } from './creator';

registerElement('group', Group);
registerElement('grid', Grid);
registerElement('item', Item);
registerElement('relations', Relations);
