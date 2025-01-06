import { Plugin, getFrontend } from "siyuan";
import "@/index.scss";

import { SettingUtils } from "./libs/setting-utils";

const STORAGE_NAME = "menu-config";

export default class SiyuanDoctreeFakeSubfolder extends Plugin {
  private settingUtils: SettingUtils;
  private treatAsSubfolderIdSet: Set<string>;
  private treatAsSubfolderEmojiSet: Set<string>;
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

  init_listener() {
    // console.log("init_listener");
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
                  // prevent
                  e.preventDefault();
                  e.stopPropagation();

                  // hijack
                  if (listItem) {
                    this.expand_subfolder(listItem);
                  }

                  return false;
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
      title: "Enable using emoji as subfolder identify",
      description:
        "When enabled, selected emoji will be used as subfolder identify, that those documents that contains these emoji will be treated as subfolder",
    });
    this.settingUtils.addItem({
      key: "emojies_that_should_be_treated_as_subfolder",
      value: "🗃️,📂,📁",
      type: "textarea",
      title: "Emojies that should be treated as subfolder",
      description: "seperate by comma",
    });
    this.settingUtils.addItem({
      key: "enable_using_id_as_subfolder_identify",
      value: true,
      type: "checkbox",
      title: "Enable using id as subfolder identify",
      description:
        "When enabled, selected id will be used as subfolder identify, that those documents that contains these id will be treated as subfolder",
    });
    this.settingUtils.addItem({
      key: "ids_that_should_be_treated_as_subfolder",
      value: "",
      type: "textarea",
      title: "Ids that should be treated as subfolder",
      description: "seperate by comma",
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
          .map(item => item.trim())  // remove space
          .filter(item => item.length > 0) // remove empty string
      );
    }

    /* ----------------^ helpers ---------------- */
}
