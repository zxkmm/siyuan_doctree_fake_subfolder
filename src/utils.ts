import { request } from "./api";
import { showMessage } from "siyuan";
import { stringToSet } from "./helpers";

/*
 * @description: if toggle button has fn__hidden class, it means there is no sub document
 * @return: has subfolder: true, no subfolder: false
 */
export async function isProvidedIdHasSubDocument(element: HTMLElement): Promise<boolean> {
  const toggleElement = element.querySelector('.b3-list-item__toggle');
  if (!toggleElement) {
    return false;
  }

  return !toggleElement.classList.contains('fn__hidden');
}

/*
 * @description: return if the document is empty
 * @return: empty: true, not empty: false
 *
 * this API were found by wilsons
 * Thanks!
 */
export async function isProvidedIdIsEmptyDocument(id: string): Promise<boolean> {
  let data = {
    id: id
  };
  let url = '/api/block/getTreeStat';
  const res = await request(url, data);
  console.log(res, "res");
  // 兼容不同API版本
  const runeCount = res.runeCount ?? res.stat?.runeCount;
  return runeCount === 0;
}

export function ifProvidedIdInTreatAsSubfolderSet(id: string, treatAsSubfolderIdSet: Set<string>): boolean {
  return treatAsSubfolderIdSet.has(id);
}

export function ifProvidedLiAreUsingUserDefinedIdentifyIcon(li: HTMLElement, treatAsSubfolderEmojiSet: Set<string>): boolean {
  const iconElement = li.querySelector(".b3-list-item__icon");
  if (!iconElement) {
    return false;
  }

  const iconText = iconElement.textContent;
  if (!iconText) {
    return false;
  }

  return treatAsSubfolderEmojiSet.has(iconText);
}

export function appendIdToTreatAsSubfolderSet(id: string, treatAsSubfolderIdSet: Set<string>) {
  treatAsSubfolderIdSet.add(id);
}

export function removeIdFromTreatAsSubfolderSet(id: string, treatAsSubfolderIdSet: Set<string>) {
  treatAsSubfolderIdSet.delete(id);
}

export function onClickDoctreeNode(nodeId: string) {
  // dom
  const element = document.querySelector(`li[data-node-id="${nodeId}"]`);
  if (!element) {
    console.warn(
      "did not found element, probably caused by theme or something"
    );
    return;
  }

  // path
  const id = element.getAttribute("data-node-id");
  if (!id) {
    console.warn(
      "node missing id attribute, probably caused by theme or something"
    );
    return;
  }

  // // debug hint
  // if (this.if_provided_id_in_treat_as_subfolder_set(id)) {
  //   console.log(`forbid open: ${id} (node id: ${nodeId})`);
  // } else {
  //   console.log(`allow open: ${id} (node id: ${nodeId})`);
  // }
}

export function captureToSetUnsetTreatAsSubfolderSetting(nodeId: string, settingUtils: any, i18n: any): Set<string> {
  // fetch setting
  const idsStr = settingUtils.get(
    "ids_that_should_be_treated_as_subfolder"
  ) as string;

  // into temp set
  const tempSet = stringToSet(idsStr);

  // worker
  if (tempSet.has(nodeId)) {
    // delete
    tempSet.delete(nodeId);
    showMessage(
      `${i18n.recoveredThisDocumentFromSubfolder} ${nodeId}`,
      2000,
      "error"
    ); //not err, just prettier with this style
  } else {
    // add
    tempSet.add(nodeId);
    showMessage(
      `${i18n.consideredThisDocumentAsSubfolder} ${nodeId}`,
      2000
    );
  }

  // convery back
  const newIdsStr = Array.from(tempSet).join(",");
  settingUtils.set("ids_that_should_be_treated_as_subfolder", newIdsStr);
  settingUtils.save();

  // return the new set
  return tempSet;
}

export function expandSubfolder(item: HTMLElement) {
  // console.log(item, "expand_subfolder");
  if (!item) {
    console.warn("not found li item, probably caused by theme or something");
    return;
  }

  // the toggle btn
  const toggleButton = item.querySelector(".b3-list-item__toggle");
  if (!toggleButton) {
    console.warn(
      "arrow button missing. probably caused by theme or something"
    );
    return;
  }

  // simulate click
  const clickEvent = new MouseEvent("click", {
    view: window,
    bubbles: true,
    cancelable: true,
  });

  toggleButton.dispatchEvent(clickEvent);
}
