import { Plugin, getFrontend, getBackend, showMessage } from "siyuan";
import "@/index.scss";
import { request, sql } from "./api";
import { SettingUtils } from "./libs/setting-utils";

import { stringToSet } from "./helpers";
import posthog from 'posthog-js'

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
  private mutationObserver: MutationObserver | null = null;
  private trackedElements: WeakSet<Element> = new WeakSet();
  private handleEvent: ((e: MouseEvent | TouchEvent) => Promise<void | boolean>) | null = null;


  /*
   * @description: if toggle button has fn__hidden class, it means there is no sub document
   * @return: has subfolder: true, no dubfolder: false
   */
  private async isProvidedIdHasSubDocument(element: HTMLElement): Promise<boolean> {
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
   * this APi were found by wilsons
   * Thanks!
   */
  private async isProvidedIdIsEmptyDocument(id: string): Promise<boolean> {
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
    const tempSet = stringToSet(idsStr);

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

  /**
   * Attach event listeners to a .b3-list--background element
   * Uses WeakSet to track which elements already have listeners (high performance)
   */
  private attachListenerToElement(element: Element) {
    // Skip if already tracked (O(1) lookup with WeakSet)
    if (this.trackedElements.has(element)) {
      return;
    }

    let already_shown_the_incompatible_device_message = false;

    if (this.isDesktop) {
      element.addEventListener("click", this.handleEvent!);
    } else if (this.isPhone || this.isTablet) {
      element.addEventListener("click", this.handleEvent!);
      // element.addEventListener("touchend", this.handleEvent!);
      // the ghost touch seems common on touchscreen, 
      // possibly by siyuan's bad touch event handling, 
      // the click works so far, so keep it until future tune...

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

    // Mark as tracked (WeakSet automatically garbage collects when element is removed from DOM)
    this.trackedElements.add(element);
  }

  /**
   * Attach listeners to all existing .b3-list--background elements
   */
  private attachListenersToAllElements() {
    const elements = document.querySelectorAll(".b3-list--background");
    elements.forEach((element) => this.attachListenerToElement(element));
  }

  /**
   * Initialize event listeners with MutationObserver for dynamic DOM changes
   * This is a smart, event-driven approach (no polling/timers)
   */
  private initListener() {
    posthog.capture('plugin_init', { property: 'value' })
    Clarity.event("plugin_init");
    console.log("init_listener with MutationObserver watchdog");

    // Define the event handler (stored as instance variable for cleanup)
    this.handleEvent = async (e: MouseEvent | TouchEvent) => {
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
                const hasSubDocument = await this.isProvidedIdHasSubDocument(
                  listItem
                );
                console.log(isEmpty, hasSubDocument, "isEmpty, hasSubDocument");
                //TODO: it still look up db table even if auto mode disabled. Currently need it and it's not that lagging. will fix it later
                if (isEmpty && hasSubDocument && enableAuto) {
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

    // Initial attachment with retry mechanism for early loading
    const tryAttach = () => {
      const elements = document.querySelectorAll(".b3-list--background");
      if (elements.length > 0) {
        console.log(`Found ${elements.length} .b3-list--background elements, attaching listeners`);
        this.attachListenersToAllElements();
        return true;
      }
      return false;
    };

    // Try immediately
    if (!tryAttach()) {
      // If not found, retry after a short delay (handles early plugin load)
      console.log("No .b3-list--background elements found, will retry and watch for DOM changes");
      setTimeout(tryAttach, 200);
    }

    // Setup MutationObserver to watch for dynamically added .b3-list--background elements
    // This is event-driven and very efficient - only triggers when DOM actually changes
    this.mutationObserver = new MutationObserver((mutations) => {
      // Only process if mutations actually added nodes (filter early for performance)
      const hasAddedNodes = mutations.some(mutation => mutation.addedNodes.length > 0);
      if (!hasAddedNodes) {
        return;
      }

      // Check for new .b3-list--background elements in added nodes
      // This is O(k) where k = number of newly added nodes, NOT O(n) where n = total DOM elements
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }

          const element = node as Element;

          // Check if the added node itself is a .b3-list--background
          if (element.classList.contains("b3-list--background")) {
            console.log("Detected new .b3-list--background element, attaching listener");
            this.attachListenerToElement(element);
            // Early return to avoid redundant querySelectorAll
            // If the element itself is .b3-list--background, we don't need to search its children
            return;
          }

          // Only search children if the node itself is not a .b3-list--background
          // This is still scoped to the newly added subtree, not the entire DOM
          const childElements = element.querySelectorAll(".b3-list--background");
          if (childElements.length > 0) {
            console.log(`Detected ${childElements.length} new .b3-list--background elements in subtree, attaching listeners`);
            childElements.forEach((child) => this.attachListenerToElement(child));
          }
        });
      });
    });

    // Start observing the entire document body for changes
    // We watch childList and subtree to catch any DOM modifications
    this.mutationObserver.observe(document.body, {
      childList: true,  // Watch for added/removed nodes
      subtree: true     // Watch entire subtree (nested changes)
      // Note: We don't watch attributes or characterData for performance
    });

    console.log("MutationObserver started, will auto-detect new document tree elements");
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
    posthog.init('phc_cpXsecXrjxZ4VwmngIUCWUrAjKLIFM5CSqDioGIN4jV', {
      api_host: 'https://us.i.posthog.com',
      defaults: '2025-11-30'
    })

    this.treatAsSubfolderIdSet = new Set();
    this.treatAsSubfolderEmojiSet = new Set();

    this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

    this.settingUtils = new SettingUtils({
      plugin: this,
      name: STORAGE_NAME,
    });
    this.settingUtils.addItem({
      key: "begging",
      value: "",
      type: "hint",
      title: this.i18n.beggingTitle,
      description: this.i18n.beggingDesc,
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
        this.backend === "harmony") ||
      ((this.frontend === "desktop" || this.frontend === "browser-desktop") &&
        this.backend === "docker");
    this.isDesktop =
      (this.frontend === "desktop" ||
        this.frontend === "browser-desktop" ||
        this.frontend === "desktop-window") &&
      this.backend != "ios" &&
      this.backend != "android" &&
      this.backend != "harmony" &&
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
    this.treatAsSubfolderEmojiSet = stringToSet(emojisStr);

    // id
    const idsStr = this.settingUtils.get(
      "ids_that_should_be_treated_as_subfolder"
    ) as string;
    this.treatAsSubfolderIdSet = stringToSet(idsStr);

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

      const ifShowCaptureModeButton = this.settingUtils.get("enable_auto_mode") &&
        !this.settingUtils.get("enable_using_id_as_subfolder_identify");

      if (ifShowCaptureModeButton) {
        buttons.capture.style.display = "none";
      }

      // default to normal mode
      this.switchMode(DocTreeFakeSubfolderMode.Normal, buttons);
    }
  }

  async onunload() {
    // Cleanup: disconnect MutationObserver to prevent memory leaks
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
      console.log("MutationObserver disconnected");
    }
  }

  uninstall() { }
}
