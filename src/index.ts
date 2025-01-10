import { Plugin, getFrontend, getBackend, showMessage } from "siyuan";
import "@/index.scss";
import { sql } from "./api";
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
  private mode: DocTreeFakeSubfolderMode = DocTreeFakeSubfolderMode.Normal;
  private to_normal_mode_count = 0;
  //^ this is because when user enter the app, it not should display the "go to -ed normal mode noti",
  //thus count and only display for 2nd times whatsoever
  private frontend: string;
  private backend: string;
  private isDesktop: boolean;
  private isPhone: boolean;
  private isTablet: boolean;

  private async isProvidedIdIsEmptyDocument(id: string): Promise<boolean> {
    // sql code was written by wilsons
    // https://ld246.com/article/1736401552973
    // Thanks!

    const sqlScript = `
        SELECT count(*) as count 
        FROM blocks 
        WHERE root_id = '${id}' 
        AND type != 'd' 
        AND markdown != ''
    `;

    try {
      const result = await sql(sqlScript);
      console.log(result, "result");
      // first result
      const count = result[0]?.count || 0;
      // if count is 0, the document is empty
      console.log("is??", count === 0);
      return count === 0;
    } catch (error) {
      console.error("Error when checking if the document is empty:", error);
      return false;
    }
  }

  // unit test
  private async example() {
    const docId = "20250110144712-on18jor";
    const isEmpty = await this.isProvidedIdIsEmptyDocument(docId);
    if (isEmpty) {
      console.log("empty doc");
    } else {
      console.log("not empty doc");
    }
  }

  ifProvidedIdInTreatAsSubfolderSet(id: string) {
    return this.treatAsSubfolderIdSet.has(id);
  }

  ifProvidedLiAreUsingUserDefinedIdentifyIcon(li: HTMLElement) {
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

  appendIdToTreatAsSubfolderSet(id: string) {
    this.treatAsSubfolderIdSet.add(id);
  }

  removeIdFromTreatAsSubfolderSet(id: string) {
    this.treatAsSubfolderIdSet.delete(id);
  }

  onClickDoctreeNode(nodeId: string) {
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

  captureToSetUnsetTreatAsSubfolderSetting(nodeId: string) {
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
      ); //not err, just prettier with this style
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

  private initListener() {
    console.log("init_listener");
    // 等待 DOM
    setTimeout(() => {
      const elements = document.querySelectorAll(".b3-list--background");
      if (elements.length === 0) {
        console.warn(
          "not found .b3-list--background element, probably caused by theme or something"
        );
        return;
      }

      // NB: this lambda is aysnc
      const handleEvent = async (e: MouseEvent | TouchEvent) => {
        // this ev were added in later code and this is for checking
        if ((e as any).sf_openDoc) {
          return;
        }

        if (!e.target || !(e.target instanceof Element)) {
          console.warn(
            "event target is invalid, probably caused by theme or something"
          );
          return;
        }

        const listItem = e.target.closest(
          'li[data-type="navigation-file"]'
        ) as HTMLElement | null;
        if (!listItem || e.target.closest(".b3-list-item__action")) {
          return; // handle allow clicked emoji/more/etc
        }

        const nodeId = listItem.getAttribute("data-node-id");
        const path = listItem.getAttribute("data-path");

        try {
          const clickedToggle = e.target.closest(".b3-list-item__toggle");
          const clickedIcon = e.target.closest(".b3-list-item__icon");
          // TODO: this probably already not needed anymore,
          //cuz toggle were already protected previously and emoji also protected earlier,
          //but leave as is for now
          const isSpecialClick = !!(clickedToggle || clickedIcon);
          /*                     ^ cast to bool */

          if (!nodeId || !this.mode) {
            return;
          }

          switch (this.mode) {
            case DocTreeFakeSubfolderMode.Normal:
              if (!isSpecialClick) {
                // cache settings in case if more chaotic
                const enableEmoji = this.settingUtils.get(
                  "enable_using_emoji_as_subfolder_identify"
                );
                const enableId = this.settingUtils.get(
                  "enable_using_id_as_subfolder_identify"
                );
                const enableAuto = this.settingUtils.get("enable_auto_mode");

                // emoji and id in list
                const isByEmoji =
                  enableEmoji &&
                  this.ifProvidedLiAreUsingUserDefinedIdentifyIcon(listItem);
                const isById =
                  enableId && this.ifProvidedIdInTreatAsSubfolderSet(nodeId);

                if (isByEmoji || isById) {
                  // Treat as folder
                  e.preventDefault();
                  e.stopPropagation();
                  this.expandSubfolder(listItem);
                  return false; // shouldn't waiste it of gone here
                } else {
                  // empty check here
                  e.preventDefault();
                  e.stopPropagation();

                  
                  const isEmpty = await this.isProvidedIdIsEmptyDocument(
                    nodeId
                  ); 
                  //TODO: it still look up db table even if auto mode disabled. Currently need it and it's not that lagging. will fix it later
                  if (isEmpty && enableAuto) {
                    // empty
                    this.expandSubfolder(listItem);
                    return false;
                  } else {
                    // not empty
                    const newEvent = new MouseEvent("click", {
                      bubbles: true,
                      cancelable: true,
                    });
                    Object.defineProperty(newEvent, "sf_openDoc", {
                      // add trigger ev to indicate if its a manual trigger
                      value: true,
                    });
                    listItem.dispatchEvent(newEvent);
                    return false;
                  }
                }
              }
              // toggle click: always fallthrough is good enough
              break;

            case DocTreeFakeSubfolderMode.Capture:
              if (!isSpecialClick) {
                // capture worker
                this.captureToSetUnsetTreatAsSubfolderSetting(nodeId);
              }
              break;

            case DocTreeFakeSubfolderMode.Reveal:
              break;
          }

          // fallback
          this.onClickDoctreeNode(nodeId);
        } catch (err) {
          console.error("error when handle document tree node click:", err);
        }
      };

      let already_shown_the_incompatible_device_message = false;

      // TODO: this part were written by chatGPT, need to go back and check what exactly changed, but worked anyway
      // 监听事件时，不使用事件捕获阶段（第三个参数为 false 或省略）
      // 这样可以让思源自身的展开折叠逻辑正常执行
      elements.forEach((element) => {
        if (this.isDesktop) {
          element.addEventListener("click", handleEvent);
          element.addEventListener("touchend", handleEvent);
        } else if (this.isPhone || this.isTablet) {
          element.addEventListener("click", handleEvent);
        } else {
          if (!already_shown_the_incompatible_device_message) {
            showMessage(
              "文档树子文件夹插件：开发者没有为您的设备做准备，清将如下信息和你的设备型号反馈给开发者：" +
                this.frontend +
                " " +
                this.backend
            );
            showMessage(
              "Document Tree Subfolder Plugin: Developer did not prepare for your device, please feedback the following information to the developer: " +
                this.frontend +
                " " +
                this.backend
            );
            already_shown_the_incompatible_device_message = true;
          }
        }
      });
    }, 100);
  }

  expandSubfolder(item: HTMLElement) {
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
      key: "enable_auto_mode",
      value: true,
      type: "checkbox",
      title: this.i18n.enableAutoMode,
      description: this.i18n.enableAutoModeDesc,
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

    this.frontend = getFrontend();
    this.backend = getBackend();
    this.isPhone =
      this.frontend === "mobile" || this.frontend === "browser-mobile";
    this.isTablet =
      ((this.frontend === "desktop" || this.frontend === "browser-desktop") &&
        this.backend === "ios") ||
      ((this.frontend === "desktop" || this.frontend === "browser-desktop") &&
        this.backend === "android") ||
      ((this.frontend === "desktop" || this.frontend === "browser-desktop") &&
        this.backend === "docker");
    this.isDesktop =
      (this.frontend === "desktop" || this.frontend === "browser-desktop") &&
      this.backend != "ios" &&
      this.backend != "android" &&
      this.backend != "docker";
  }

  private updateTopBarButtonStyles(
    activeMode: DocTreeFakeSubfolderMode,
    buttons: {
      normal: HTMLElement;
      capture: HTMLElement;
      reveal: HTMLElement;
    }
  ) {
    const setButtonStyle = (button: HTMLElement, isActive: boolean) => {
      button.style.backgroundColor = isActive
        ? "var(--b3-toolbar-color)"
        : "var(--b3-toolbar-background)";
      button.style.color = isActive
        ? "var(--b3-toolbar-background)"
        : "var(--b3-toolbar-color)";
    };

    setButtonStyle(
      buttons.normal,
      activeMode === DocTreeFakeSubfolderMode.Normal
    );
    setButtonStyle(
      buttons.capture,
      activeMode === DocTreeFakeSubfolderMode.Capture
    );
    setButtonStyle(
      buttons.reveal,
      activeMode === DocTreeFakeSubfolderMode.Reveal
    );
  }

  private switchMode(
    mode: DocTreeFakeSubfolderMode,
    buttons: {
      normal: HTMLElement;
      capture: HTMLElement;
      reveal: HTMLElement;
    }
  ) {
    this.to_normal_mode_count < 2 ? this.to_normal_mode_count++ : null;
    this.mode = mode;
    this.updateTopBarButtonStyles(mode, buttons);

    const messages = {
      [DocTreeFakeSubfolderMode.Normal]: {
        text: this.i18n.enterNormalMode,
        duration: 2000,
      },
      [DocTreeFakeSubfolderMode.Capture]: {
        text: this.i18n.enterCaptureMode,
        duration: 8000,
      },
      [DocTreeFakeSubfolderMode.Reveal]: {
        text: this.i18n.enterRevealMode,
        duration: 8000,
      },
    };

    const { text, duration } = messages[mode];
    if (this.to_normal_mode_count >= 2) {
      showMessage(text, duration);
    }
  }

  onLayoutReady() {
    console.log(this.frontend, this.backend);
    console.log(this.isPhone, this.isTablet, this.isDesktop);
    this.initListener();
    this.settingUtils.load();

    // load emoji setting
    const emojisStr = this.settingUtils.get(
      "emojies_that_should_be_treated_as_subfolder"
    ) as string;
    this.treatAsSubfolderEmojiSet = this.stringToSet(emojisStr);

    // id
    const idsStr = this.settingUtils.get(
      "ids_that_should_be_treated_as_subfolder"
    ) as string;
    this.treatAsSubfolderIdSet = this.stringToSet(idsStr);

    if (this.settingUtils.get("enable_mode_switch_buttons")) {
      const buttons = {
        normal: this.addTopBar({
          icon: "iconDoctreeFakeSubfolderNormalMode",
          title: this.i18n.normalMode,
          position: "left",
          callback: () =>
            this.switchMode(DocTreeFakeSubfolderMode.Normal, buttons),
        }),
        capture: this.addTopBar({
          icon: "iconDoctreeFakeSubfolderCaptureMode",
          title: this.i18n.captureMode,
          position: "left",
          callback: () =>
            this.switchMode(DocTreeFakeSubfolderMode.Capture, buttons),
        }),
        reveal: this.addTopBar({
          icon: "iconDoctreeFakeSubfolderRevealMode",
          title: this.i18n.revealMode,
          position: "left",
          callback: () =>
            this.switchMode(DocTreeFakeSubfolderMode.Reveal, buttons),
        }),
      };

      // default to normal mode
      this.switchMode(DocTreeFakeSubfolderMode.Normal, buttons);
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
