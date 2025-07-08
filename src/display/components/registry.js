import { Background } from './Background';
import { Bar } from './Bar';
import { Icon } from './Icon';
import { Text } from './Text';
import { registerComponent } from './creator';

registerComponent('background', Background);
registerComponent('bar', Bar);
registerComponent('icon', Icon);
registerComponent('text', Text);
