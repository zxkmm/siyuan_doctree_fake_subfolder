export enum DocTreeFakeSubfolderMode {
  Normal = "normal",
  Capture = "capture", // click to add item into list
  Reveal = "reveal", // click to view the actual document
}

export interface DocTreeItem {
  element: HTMLElement;
  nodeId: string;
  name: string;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
  parentNodeId?: string;
  path: string[];
}
