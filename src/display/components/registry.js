import { Background } from './Background';
import { Bar } from './Bar';
import { registerComponent } from './creator';
import { Icon } from './Icon';
import { Text } from './Text';

registerComponent('background', Background);
registerComponent('bar', Bar);
registerComponent('icon', Icon);
registerComponent('text', Text);
