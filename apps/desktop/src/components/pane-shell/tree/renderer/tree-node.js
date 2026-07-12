import { jsx as _jsx } from "react/jsx-runtime";
import { TreeGroup } from './tree-group';
import { TreeSplit } from './tree-split';
/** Dispatch a layout node to its renderer — the split/group recursion point.
 *  `root` marks the tree's top split (side collapse applies only there).
 *  `parentAxis` is the containing split's orientation — a group collapses
 *  ALONG that axis, so it picks the minimized form (row → vertical rail,
 *  column → horizontal header). `railSide` is which half of that row the
 *  child sits in — the rail's divider stroke faces the content side. */
export function TreeNode({ node, parentAxis, railSide, root }) {
    return node.type === 'split' ? (_jsx(TreeSplit, { node: node, root: root })) : (_jsx(TreeGroup, { node: node, parentAxis: parentAxis, railSide: railSide }));
}
