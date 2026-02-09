/**
 * Finds the index of the first item in an array that matches the criteria, based on a priority list of keys.
 * @param {Array<Object>} arr - The array to search.
 * @param {Object} criteria - The criteria object to match.
 * @param {Array<string>} [priorityKeys=['id', 'label', 'type']] - The list of keys to check, in order of priority.
 * @param {Set<number>} [usedIndexes=new Set()] - A set of indices to exclude from the search.
 * @returns {number} - The index of the first matching item, or -1 if no match is found.
 */
export const findIndexByPriority = (
  arr,
  criteria,
  usedIndexes = new Set(),
  priorityKeys = ['id', 'label', 'type'],
) => {
  for (const key of priorityKeys) {
    if (key in criteria) {
      return arr.findIndex(
        (item, idx) => !usedIndexes.has(idx) && item?.[key] === criteria[key],
      );
    }
  }

  return -1;
};
