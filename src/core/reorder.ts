import type { GroupConfig, WatchedItem } from "./types";
import { sameItem } from "./types";

/**
 * Pure reorder operations behind the tree's drag & drop. Both mutate the
 * given groups array in place (the caller persists it afterwards) and
 * return whether anything actually moved. The array order IS the
 * display order everywhere, including the settings form.
 */

/**
 * Move one watched entry: within its group, or into another group bound
 * to the SAME account (an entry is only meaningful under its account,
 * so cross-account moves are rejected). When `beforeItem` is given, the
 * entry is inserted before it in the target group; otherwise it is
 * appended at the end.
 */
export function moveWatchedItem(
  groups: GroupConfig[],
  sourceGroupId: string,
  item: WatchedItem,
  targetGroupId: string,
  beforeItem?: WatchedItem,
): boolean {
  const source = groups.find((g) => g.id === sourceGroupId);
  const target = groups.find((g) => g.id === targetGroupId);
  if (!source || !target) {
    return false;
  }
  if (source.accountId !== target.accountId) {
    return false;
  }
  const fromIndex = source.workflows.findIndex((w) => sameItem(w, item));
  if (fromIndex < 0) {
    return false;
  }
  const [moved] = source.workflows.splice(fromIndex, 1);
  let insertIndex = target.workflows.length;
  if (beforeItem) {
    const beforeIndex = target.workflows.findIndex((w) => sameItem(w, beforeItem));
    if (beforeIndex >= 0) {
      insertIndex = beforeIndex;
    }
  }
  target.workflows.splice(insertIndex, 0, moved);
  return true;
}

/**
 * Move one group before `beforeGroupId` in the groups array (or to the
 * end when omitted). Display filters groups per account, so the order
 * that matters is the relative order among one account's groups.
 */
export function moveGroup(groups: GroupConfig[], groupId: string, beforeGroupId?: string): boolean {
  const fromIndex = groups.findIndex((g) => g.id === groupId);
  if (fromIndex < 0) {
    return false;
  }
  const [moved] = groups.splice(fromIndex, 1);
  let insertIndex = groups.length;
  if (beforeGroupId) {
    const beforeIndex = groups.findIndex((g) => g.id === beforeGroupId);
    if (beforeIndex >= 0) {
      insertIndex = beforeIndex;
    }
  }
  groups.splice(insertIndex, 0, moved);
  return true;
}
