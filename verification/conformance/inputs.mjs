// Markdown explains the contract; executable fixtures, schemas and inventories
// define it. Unknown non-document inputs remain conservative product inputs.
export function isContractInput(path) {
  return path.startsWith('conformance/') && !path.endsWith('.md');
}
