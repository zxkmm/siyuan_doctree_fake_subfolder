import { showMessage } from "siyuan";
import { DocTreeFakeSubfolderMode } from "./types";
import { isProvidedIdHasSubDocument, isProvidedIdIsEmptyDocument, captureToSetUnsetTreatAsSubfolderSetting, expandSubfolder, onClickDoctreeNode } from "./utils";

export class ModeHandler {
  private mode: DocTreeFakeSubfolderMode = DocTreeFakeSubfolderMode.Normal;
  private to_normal_mode_count = 0;
  private frontend: string;
  private backend: string;
  private isDesktop: boolean;
  private isPhone: boolean;
  private isTablet: boolean;
  private settingUtils: any;
  private treatAsSubfolderIdSet: Set<string>;
  private treatAsSubfolderEmojiSet: Set<string>;
  private i18n: any;

  constructor(settingUtils: any, treatAsSubfolderIdSet: Set<string>, treatAsSubfolderEmojiSet: Set<string>, i18n: any, frontend: string, backend: string, isDesktop: boolean, isPhone: boolean, isTablet: boolean) {
    this.settingUtils = settingUtils;
    this.treatAsSubfolderIdSet = treatAsSubfolderIdSet;
    this.treatAsSubfolderEmojiSet = treatAsSubfolderEmojiSet;
    this.i18n = i18n;
    this.frontend = frontend;
    this.backend = backend;
    this.isDesktop = isDesktop;
    this.isPhone = isPhone;
    this.isTablet = isTablet;
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
                  this.treatAsSubfolderEmojiSet.has(listItem.querySelector(".b3-list-item__icon")?.textContent || "");
                const isById =
                  enableId && this.treatAsSubfolderIdSet.has(nodeId);

                if (isByEmoji || isById) {
                  // Treat as folder
                  e.preventDefault();
                  e.stopPropagation();
                  expandSubfolder(listItem);
                  return false; // shouldn't waiste it of gone here
                } else {
                  // empty check here
                  e.preventDefault();
                  e.stopPropagation();


                  const isEmpty = await isProvidedIdIsEmptyDocument(
                    nodeId
                  );
                  const hasSubDocument = await isProvidedIdHasSubDocument(
                    listItem
                  );
                  console.log(isEmpty, hasSubDocument, "isEmpty, hasSubDocument");
                  //TODO: it still look up db table even if auto mode disabled. Currently need it and it's not that lagging. will fix it later
                  if (isEmpty && hasSubDocument && enableAuto) {
                    // empty
                    expandSubfolder(listItem);
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
                this.treatAsSubfolderIdSet = captureToSetUnsetTreatAsSubfolderSetting(nodeId, this.settingUtils, this.i18n);
              }
              break;

            case DocTreeFakeSubfolderMode.Reveal:
              break;
          }

          // fallback
          onClickDoctreeNode(nodeId);
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
    }, 200);//TODO: this is not elegant...
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

  // Public methods to call from plugin
  public initializeListener() {
    this.initListener();
  }

  public getMode(): DocTreeFakeSubfolderMode {
    return this.mode;
  }

  public switchToMode(mode: DocTreeFakeSubfolderMode, buttons: { normal: HTMLElement; capture: HTMLElement; reveal: HTMLElement; }) {
    this.switchMode(mode, buttons);
  }
}
