import { Plugin, getFrontend, showMessage } from "siyuan";
import "@/index.scss";

import { SettingUtils } from "./libs/setting-utils";

const STORAGE_NAME = "menu-config";

enum DocTreeFakeSubfolderMode {
  Normal = "normal",
  Capture = "capture", // click to add item into list
  Reveal = "reveal", // click to view the actual document
}

export default class SiyuanDoctreeFakeSubfolder extends Plugin {
  private settingUtils: SettingUtils;
  private treatAsSubfolderIdSet: Set<string>;
  private treatAsSubfolderEmojiSet: Set<string>;
  private mode: DocTreeFakeSubfolderMode;

  if_provided_id_in_treat_as_subfolder_set(id: string) {
    return this.treatAsSubfolderIdSet.has(id);
  }

  if_provided_li_are_using_user_defined_identify_icon(li: HTMLElement) {
    const iconElement = li.querySelector(".b3-list-item__icon");
    if (!iconElement) {
      return false;
    }

    const iconText = iconElement.textContent;
    if (!iconText) {
      return false;
    }

    return this.treatAsSubfolderEmojiSet.has(iconText);
  }

  append_id_to_treat_as_subfolder_set(id: string) {
    this.treatAsSubfolderIdSet.add(id);
  }

  remove_id_from_treat_as_subfolder_set(id: string) {
    this.treatAsSubfolderIdSet.delete(id);
  }

  on_click_doctree_node(nodeId: string) {
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

  capture_to_set_unset_treat_as_subfolder_setting(nodeId: string) {
    // fetch setting
    const idsStr = this.settingUtils.get(
      "ids_that_should_be_treated_as_subfolder"
    ) as string;

    // into temp set
    const tempSet = this.stringToSet(idsStr);

    // worker
    if (tempSet.has(nodeId)) {
      // delete
      tempSet.delete(nodeId);
      showMessage(
        `${this.i18n.recoveredThisDocumentFromSubfolder} ${nodeId}`,
        2000,
        "error"
      ); //not err, just prettier
    } else {
      // add
      tempSet.add(nodeId);
      showMessage(
        `${this.i18n.consideredThisDocumentAsSubfolder} ${nodeId}`,
        2000
      );
    }

    // convery back
    const newIdsStr = Array.from(tempSet).join(",");
    this.settingUtils.set("ids_that_should_be_treated_as_subfolder", newIdsStr);
    this.settingUtils.save();

    // only need to update local var cuz when next boot it will load from settings anyway
    this.treatAsSubfolderIdSet = tempSet;
  }

  init_listener() {
    console.log("init_listener");
    // wait for DOM loaded
    setTimeout(() => {
      const elements = document.querySelectorAll(".b3-list--background");
      if (elements.length === 0) {
        console.warn(
          "not found .b3-list--background element, probably caused by theme or something"
        );
        return;
      }

      // for each
      elements.forEach((element) => {
        element.addEventListener(
          "click",
          (e) => {
            if (!e.target || !(e.target instanceof Element)) {
              console.warn(
                "click target is invalid, probably caused by theme or something"
              );
              return;
            }

            const listItem = e.target.closest(
              'li[data-type="navigation-file"]'
            );

            if (listItem && !e.target.closest(".b3-list-item__action")) {
              const nodeId = listItem.dataset.nodeId;
              const path = listItem.dataset.path;

              // console.log("---node:", listItem);
              // console.log("---path:", path);
              // console.log("---ID:", nodeId);

              try {
                // check worker
                if (
                  this.mode == DocTreeFakeSubfolderMode.Normal &&
                  nodeId &&
                  ((this.settingUtils.get(
                    "enable_using_emoji_as_subfolder_identify"
                  ) &&
                    this.if_provided_li_are_using_user_defined_identify_icon(
                      listItem
                    )) ||
                    (this.settingUtils.get(
                      "enable_using_id_as_subfolder_identify"
                    ) &&
                      this.if_provided_id_in_treat_as_subfolder_set(nodeId))) &&
                  !e.target.closest(".b3-list-item__toggle") && // allow the toggle button
                  !e.target.closest(".b3-list-item__icon") // allow the emoji icon
                ) {
                  console.log("---mode:", this.mode);
                  // prevent
                  e.preventDefault();
                  e.stopPropagation();

                  // hijack
                  if (listItem) {
                    this.expand_subfolder(listItem);
                  }

                  return false;
                } else if (
                  this.mode == DocTreeFakeSubfolderMode.Capture &&
                  !e.target.closest(".b3-list-item__toggle") &&
                  !e.target.closest(".b3-list-item__icon") // these two still needs not to be able to reach the arrow and emoji icon
                ) {
                  this.capture_to_set_unset_treat_as_subfolder_setting(nodeId);
                } else if (
                  this.mode == DocTreeFakeSubfolderMode.Reveal &&
                  !e.target.closest(".b3-list-item__toggle") &&
                  !e.target.closest(".b3-list-item__icon") //same here
                ) {
                  //fallthrough
                }

                // allow original behavior
                this.on_click_doctree_node(nodeId);
              } catch (err) {
                console.error(
                  "error when handle document tree node click:",
                  err
                );
              }
            }
          },
          true
        ); // work around for dynamic li
      });
    }, 100); // TODO: check if necessary
  }

  expand_subfolder(item: HTMLElement) {
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

  async onload() {
    this.treatAsSubfolderIdSet = new Set();
    this.treatAsSubfolderEmojiSet = new Set();

    this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

    this.settingUtils = new SettingUtils({
      plugin: this,
      name: STORAGE_NAME,
    });
    this.settingUtils.addItem({
      key: "enable_using_emoji_as_subfolder_identify",
      value: true,
      type: "checkbox",
      title: this.i18n.enableUsingEmojiAsSubfolderIdentify,
      description: this.i18n.enableUsingEmojiAsSubfolderIdentifyDesc,
    });
    this.settingUtils.addItem({
      key: "emojies_that_should_be_treated_as_subfolder",
      value: "🗃️,📂,📁",
      type: "textarea",
      title: this.i18n.emojisThatShouldBeTreatedAsSubfolder,
      description: this.i18n.emojisThatShouldBeTreatedAsSubfolderDesc,
    });
    this.settingUtils.addItem({
      key: "enable_using_id_as_subfolder_identify",
      value: true,
      type: "checkbox",
      title: this.i18n.enableUsingIdAsSubfolderIdentify,
      description: this.i18n.enableUsingIdAsSubfolderIdentifyDesc,
    });
    this.settingUtils.addItem({
      key: "ids_that_should_be_treated_as_subfolder",
      value: "",
      type: "textarea",
      title: this.i18n.idsThatShouldBeTreatedAsSubfolder,
      description: this.i18n.idsThatShouldBeTreatedAsSubfolderDesc,
    });
    this.settingUtils.addItem({
      key: "enable_mode_switch_buttons",
      value: true,
      type: "checkbox",
      title: this.i18n.enableModeSwitchButtons,
      description: this.i18n.enableModeSwitchButtonsDesc,
    });
    this.settingUtils.addItem({
      key: "Hint",
      value: "",
      type: "hint",
      title: this.i18n.hintTitle,
      description: this.i18n.hintDesc,
    });

    try {
      this.settingUtils.load();
    } catch (error) {
      console.error(
        "Error loading settings storage, probably empty config json:",
        error
      );
    }

    this.addIcons(` 
      <symbol id="iconDoctreeFakeSubfolderNormalMode" viewBox="0 0 48 48">
          <path d="M26,30H42a2,2,0,0,0,2-2V20a2,2,0,0,0-2-2H26a2,2,0,0,0-2,2v2H16V14h6a2,2,0,0,0,2-2V4a2,2,0,0,0-2-2H6A2,2,0,0,0,4,4v8a2,2,0,0,0,2,2h6V40a2,2,0,0,0,2,2H24v2a2,2,0,0,0,2,2H42a2,2,0,0,0,2-2V36a2,2,0,0,0-2-2H26a2,2,0,0,0-2,2v2H16V26h8v2A2,2,0,0,0,26,30Z"></path>
          </symbol>
          `);

    this.addIcons(`
      <symbol id="iconDoctreeFakeSubfolderCaptureMode" viewBox="0 0 48 48">
          <path d="M42,4H6A2,2,0,0,0,4,6V42a2,2,0,0,0,2,2H42a2,2,0,0,0,2-2V6A2,2,0,0,0,42,4ZM34,26H26v8a2,2,0,0,1-4,0V26H14a2,2,0,0,1,0-4h8V14a2,2,0,0,1,4,0v8h8a2,2,0,0,1,0,4Z"></path>
          </symbol>
          `);

    this.addIcons(`
      <symbol id="iconDoctreeFakeSubfolderRevealMode" viewBox="0 0 24 24">
          <path d="M3 14C3 9.02944 7.02944 5 12 5C16.9706 5 21 9.02944 21 14M17 14C17 16.7614 14.7614 19 12 19C9.23858 19 7 16.7614 7 14C7 11.2386 9.23858 9 12 9C14.7614 9 17 11.2386 17 14Z"></path>
          </symbol>
          `);
  }

  onLayoutReady() {
    this.init_listener();
    this.settingUtils.load();

    // load emoji setting
    const emojisStr = this.settingUtils.get(
      "emojies_that_should_be_treated_as_subfolder"
    ) as string;
    this.treatAsSubfolderEmojiSet = this.stringToSet(emojisStr);

    // console.log("---emojisStr", emojisStr);
    // console.log("---this.treatAsSubfolderEmojiSet", this.treatAsSubfolderEmojiSet);

    // id
    const idsStr = this.settingUtils.get(
      "ids_that_should_be_treated_as_subfolder"
    ) as string;
    this.treatAsSubfolderIdSet = this.stringToSet(idsStr);

    // console.log("---idsStr", idsStr);
    // console.log("---this.treatAsSubfolderIdSet", this.treatAsSubfolderIdSet);
    if (this.settingUtils.get("enable_mode_switch_buttons")) { // ya ummmmm this is the best that i can do within siyuan's api for plugins
      const topBarElementDoctreeFakeSubfolderNormalMode = this.addTopBar({
        icon: "iconDoctreeFakeSubfolderNormalMode",
        title: this.i18n.normalMode,
        position: "left",
        callback: () => {
          showMessage(this.i18n.enterNormalMode, 2000);
          this.mode = DocTreeFakeSubfolderMode.Normal;
          topBarElementDoctreeFakeSubfolderNormalMode.style.backgroundColor =
            "var(--b3-toolbar-color)";
          topBarElementDoctreeFakeSubfolderNormalMode.style.color =
            "var(--b3-toolbar-background)";
          topBarElementDoctreeFakeSubfolderCaptureMode.style.backgroundColor =
            "var(--b3-toolbar-background)";
          topBarElementDoctreeFakeSubfolderCaptureMode.style.color =
            "var(--b3-toolbar-color)";
          topBarElementDoctreeFakeSubfolderRevealMode.style.backgroundColor =
            "var(--b3-toolbar-background)";
          topBarElementDoctreeFakeSubfolderRevealMode.style.color =
            "var(--b3-toolbar-color)";
        },
      });

      const topBarElementDoctreeFakeSubfolderCaptureMode = this.addTopBar({
        icon: "iconDoctreeFakeSubfolderCaptureMode",
        title: this.i18n.captureMode,
        position: "left",
        callback: () => {
          showMessage(this.i18n.enterCaptureMode, 8000);
          this.mode = DocTreeFakeSubfolderMode.Capture;
          topBarElementDoctreeFakeSubfolderCaptureMode.style.backgroundColor =
            "var(--b3-toolbar-color)";
          topBarElementDoctreeFakeSubfolderCaptureMode.style.color =
            "var(--b3-toolbar-background)";
          topBarElementDoctreeFakeSubfolderNormalMode.style.backgroundColor =
            "var(--b3-toolbar-background)";
          topBarElementDoctreeFakeSubfolderNormalMode.style.color =
            "var(--b3-toolbar-color)";
          topBarElementDoctreeFakeSubfolderRevealMode.style.backgroundColor =
            "var(--b3-toolbar-background)";
          topBarElementDoctreeFakeSubfolderRevealMode.style.color =
            "var(--b3-toolbar-color)";
        },
      });

      const topBarElementDoctreeFakeSubfolderRevealMode = this.addTopBar({
        icon: "iconDoctreeFakeSubfolderRevealMode",
        title: this.i18n.revealMode,
        position: "left",
        callback: () => {
          showMessage(this.i18n.enterRevealMode, 8000);
          this.mode = DocTreeFakeSubfolderMode.Reveal;
          topBarElementDoctreeFakeSubfolderRevealMode.style.backgroundColor =
            "var(--b3-toolbar-color)";
          topBarElementDoctreeFakeSubfolderRevealMode.style.color =
            "var(--b3-toolbar-background)";
          topBarElementDoctreeFakeSubfolderNormalMode.style.backgroundColor =
            "var(--b3-toolbar-background)";
          topBarElementDoctreeFakeSubfolderNormalMode.style.color =
            "var(--b3-toolbar-color)";
          topBarElementDoctreeFakeSubfolderCaptureMode.style.backgroundColor =
            "var(--b3-toolbar-background)";
          topBarElementDoctreeFakeSubfolderCaptureMode.style.color =
            "var(--b3-toolbar-color)";
        },
      });

      this.mode = DocTreeFakeSubfolderMode.Normal;
      topBarElementDoctreeFakeSubfolderNormalMode.style.backgroundColor =
        "var(--b3-toolbar-color)";
      topBarElementDoctreeFakeSubfolderNormalMode.style.color =
        "var(--b3-toolbar-background)";
    }
  }

  async onunload() {}

  uninstall() {}

  /* ----------------v helpers ---------------- */
  private stringToSet(str: string): Set<string> {
    if (!str) {
      return new Set();
    }
    return new Set(
      str
        .split(/[,，]/)
        .map((item) => item.trim()) // remove space
        .filter((item) => item.length > 0) // remove empty string
    );
  }

  /* ----------------^ helpers ---------------- */
}
