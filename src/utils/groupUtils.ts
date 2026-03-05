export const getGroupDisplayName = (groupName: string, groupItemsStr: string) => {
  const isDefaultName = !groupName || groupName.trim() === '' || groupName.match(/^Group \d+$/);
  
  if (isDefaultName && groupItemsStr) {
    const items = groupItemsStr.split(', ').map(s => s.trim());
    if (items.length <= 2) return items.join(', ');
    return `${items.slice(0, 2).join(', ')}...`;
  }
  return groupName || 'Unnamed Group';
};
