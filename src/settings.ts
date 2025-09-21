import { Plugin } from "siyuan";

export function initializeSettings(plugin: Plugin, settingUtils: any) {
  settingUtils.addItem({
    key: "begging",
    value: "",
    type: "hint",
    title: plugin.i18n.beggingTitle,
    description: plugin.i18n.beggingDesc,
  });
  settingUtils.addItem({
    key: "enable_auto_mode",
    value: true,
    type: "checkbox",
    title: plugin.i18n.enableAutoMode,
    description: plugin.i18n.enableAutoModeDesc,
  });
  settingUtils.addItem({
    key: "enable_using_emoji_as_subfolder_identify",
    value: true,
    type: "checkbox",
    title: plugin.i18n.enableUsingEmojiAsSubfolderIdentify,
    description: plugin.i18n.enableUsingEmojiAsSubfolderIdentifyDesc,
  });
  settingUtils.addItem({
    key: "emojies_that_should_be_treated_as_subfolder",
    value: "🗃️,📂,📁",
    type: "textarea",
    title: plugin.i18n.emojisThatShouldBeTreatedAsSubfolder,
    description: plugin.i18n.emojisThatShouldBeTreatedAsSubfolderDesc,
  });
  settingUtils.addItem({
    key: "enable_using_id_as_subfolder_identify",
    value: true,
    type: "checkbox",
    title: plugin.i18n.enableUsingIdAsSubfolderIdentify,
    description: plugin.i18n.enableUsingIdAsSubfolderIdentifyDesc,
  });
  settingUtils.addItem({
    key: "ids_that_should_be_treated_as_subfolder",
    value: "",
    type: "textarea",
    title: plugin.i18n.idsThatShouldBeTreatedAsSubfolder,
    description: plugin.i18n.idsThatShouldBeTreatedAsSubfolderDesc,
  });
  settingUtils.addItem({
    key: "enable_mode_switch_buttons",
    value: true,
    type: "checkbox",
    title: plugin.i18n.enableModeSwitchButtons,
    description: plugin.i18n.enableModeSwitchButtonsDesc,
  });
  settingUtils.addItem({
    key: "enable_keyboard_navigation",
    value: true,
    type: "checkbox",
    title: "Enable Keyboard Navigation",
    description: "Enable keyboard navigation interface for quick document access. Use a-z keys to navigate, then ab, ac, etc. for more items.",
  });
  settingUtils.addItem({
    key: "Hint",
    value: "",
    type: "hint",
    title: plugin.i18n.hintTitle,
    description: plugin.i18n.hintDesc,
  });
}
