import { exampleMeshLab } from './example-mesh-lab.js';
import { examplePlantOps } from './example-plant-ops.js';

export const examples = [examplePlantOps, exampleMeshLab];

export const findExampleById = (id) =>
  examples.find((example) => example.id === id);
