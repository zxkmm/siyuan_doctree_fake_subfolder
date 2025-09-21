import { Plugin, getFrontend, getBackend } from "siyuan";
import "@/index.scss";
import { SettingUtils } from "./libs/setting-utils";
import { stringToSet } from "./helpers";

import { DocTreeFakeSubfolderMode } from "./types";
import { STORAGE_NAME } from "./constants";
import { KeyboardNavigationManager } from "./keyboard-navigation";
import { ModeHandler } from "./mode-handler";
import { initializeSettings } from "./settings";

export default class SiyuanDoctreeFakeSubfolder extends Plugin {
  private settingUtils: SettingUtils;
  private treatAsSubfolderIdSet: Set<string>;
  private treatAsSubfolderEmojiSet: Set<string>;
  private frontend: string;
  private backend: string;
  private isDesktop: boolean;
  private isPhone: boolean;
  private isTablet: boolean;

  private keyboardNav: KeyboardNavigationManager;
  private modeHandler: ModeHandler;


  async onload() {
    this.treatAsSubfolderIdSet = new Set();
    this.treatAsSubfolderEmojiSet = new Set();

    this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

    this.settingUtils = new SettingUtils({
      plugin: this,
      name: STORAGE_NAME,
    });
    initializeSettings(this, this.settingUtils);

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

    this.addIcons(`
      <symbol id="iconDoctreeFakeSubfolderKeyboardMode" viewBox="0 0 24 24">
          <path d="M3 6C3 4.89543 3.89543 4 5 4H19C20.1046 4 21 4.89543 21 6V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V6ZM5 6V18H19V6H5ZM6 8H7V9H6V8ZM9 8H10V9H9V8ZM12 8H13V9H12V8ZM15 8H16V9H15V8ZM18 8H19V9H18V8ZM6 11H7V12H6V11ZM9 11H10V12H9V11ZM12 11H13V12H12V11ZM15 11H16V12H15V11ZM18 11H19V12H18V11ZM8 14H16V15H8V14Z"></path>
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
      (this.frontend === "desktop" ||
        this.frontend === "browser-desktop" ||
        this.frontend === "desktop-window") &&
      this.backend != "ios" &&
      this.backend != "android" &&
      this.backend != "docker";
  }

  onLayoutReady() {
    console.log(this.frontend, this.backend);
    console.log(this.isPhone, this.isTablet, this.isDesktop);
    this.modeHandler = new ModeHandler(this.settingUtils, this.treatAsSubfolderIdSet, this.treatAsSubfolderEmojiSet, this.i18n, this.frontend, this.backend, this.isDesktop, this.isPhone, this.isTablet);
    this.keyboardNav = new KeyboardNavigationManager();
    this.modeHandler.initializeListener();
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
            this.modeHandler.switchToMode(DocTreeFakeSubfolderMode.Normal, buttons),
        }),
        capture: this.addTopBar({
          icon: "iconDoctreeFakeSubfolderCaptureMode",
          title: this.i18n.captureMode,
          position: "left",
          callback: () =>
            this.modeHandler.switchToMode(DocTreeFakeSubfolderMode.Capture, buttons),
        }),
        reveal: this.addTopBar({
          icon: "iconDoctreeFakeSubfolderRevealMode",
          title: this.i18n.revealMode,
          position: "left",
          callback: () =>
            this.modeHandler.switchToMode(DocTreeFakeSubfolderMode.Reveal, buttons),
        }),
      };

      const ifShowCaptureModeButton = this.settingUtils.get("enable_auto_mode") &&
        !this.settingUtils.get("enable_using_id_as_subfolder_identify");

      if (ifShowCaptureModeButton) {
        buttons.capture.style.display = "none";
      }

      // default to normal mode
      this.modeHandler.switchToMode(DocTreeFakeSubfolderMode.Normal, buttons);
    }

    // Add standalone keyboard navigation button if enabled
    if (this.settingUtils.get("enable_keyboard_navigation")) {
      this.addTopBar({
        icon: "iconDoctreeFakeSubfolderKeyboardMode",
        title: "Keyboard Navigation",
        position: "left",
        callback: () => {
          if (this.keyboardNav.isActive()) {
            this.keyboardNav.hideKeyboardNavigation();
          } else {
            this.keyboardNav.showKeyboardNavigation();
          }
        },
      });


      this.addCommand({
        langKey: "showDialog",
        hotkey: "⌘Q",
        callback: () => {
          if (this.keyboardNav.isActive()) {
            this.keyboardNav.hideKeyboardNavigation();
          } else {
            this.keyboardNav.showKeyboardNavigation();
          }
        },
      });
    }
  }

  async onunload() {
    // Clean up keyboard navigation if active
    if (this.keyboardNav.isActive()) {
      this.keyboardNav.hideKeyboardNavigation();
    }
  }

  uninstall() { }
}
