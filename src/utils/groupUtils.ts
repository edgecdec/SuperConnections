export const getGroupDisplayName = (groupName: string, groupItemsStr: string) => {
  if (groupName.match(/^Group \d+$/) && groupItemsStr) {
    const items = groupItemsStr.split(', ').map(s => s.trim());
    if (items.length <= 2) return items.join(', ');
    return `${items.slice(0, 2).join(', ')}...`;
  }
  return groupName;
};
