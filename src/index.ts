import { Plugin, getFrontend, getBackend, showMessage } from "siyuan";
import "@/index.scss";
import { request } from "./api";
import { SettingUtils } from "./libs/setting-utils";

import { stringToSet } from "./helpers";

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
  //^ this is because when user enter the app, it should not display the "go to -ed normal mode noti",
  //thus count and only display from 2nd times whatsoever
  private frontend: string;
  private backend: string;
  private isDesktop: boolean;
  private isPhone: boolean;
  private isTablet: boolean;
  
  // Keyboard navigation properties
  private keyboardNavActive: boolean = false;
  private keyboardNavOverlay: HTMLElement | null = null;
  private docTreeItems: Array<{
    element: HTMLElement;
    nodeId: string;
    name: string;
    level: number;
    hasChildren: boolean;
    isExpanded: boolean;
    parentNodeId?: string;
    path: string[];
  }> = [];
  private keyMappings: Map<string, number> = new Map(); // key -> index in docTreeItems
  private currentKeySequence: string = "";
  private keySequenceTimeout: number | null = null;
  private currentNavigationPath: string[] = []; // Current breadcrumb path
  private currentNavigationLevel: number = 0; // Current level in the tree
  private currentParentElement: HTMLElement | null = null; // Current parent element we're viewing children of


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

  // Keyboard navigation methods
  private generateKeySequence(index: number): string {
    if (index < 26) {
      return String.fromCharCode(97 + index); // a-z
    }
    
    const firstChar = Math.floor((index - 26) / 26);
    const secondChar = (index - 26) % 26;
    return String.fromCharCode(97 + firstChar) + String.fromCharCode(97 + secondChar);
  }

  private buildDocumentPath(element: HTMLElement): string[] {
    const path: string[] = [];
    
    // Get current element's name
    const nameElement = element.querySelector('.b3-list-item__text');
    const currentName = nameElement?.textContent?.trim();
    if (currentName) {
      path.push(currentName);
    }
    
    // Calculate current element's level
    const currentToggle = element.querySelector('.b3-list-item__toggle') as HTMLElement;
    const currentPadding = currentToggle ? parseInt(currentToggle.style.paddingLeft || '0') : 0;
    const currentLevel = Math.max(0, Math.floor(currentPadding / 18));
    
    // For level 0 items (notebooks), the path is just the name
    if (currentLevel === 0) {
      console.log(`Built path for root item "${currentName}":`, path);
      return path;
    }
    
    // For deeper levels, build the full path by walking up the tree
    let currentElement = element;
    const fullPath: string[] = [];
    
    while (currentElement) {
      const nameElem = currentElement.querySelector('.b3-list-item__text');
      const name = nameElem?.textContent?.trim();
      if (name) {
        fullPath.unshift(name);
      }
      
      // Find parent by looking for the previous item with a lower level
      const toggle = currentElement.querySelector('.b3-list-item__toggle') as HTMLElement;
      const padding = toggle ? parseInt(toggle.style.paddingLeft || '0') : 0;
      const level = Math.max(0, Math.floor(padding / 18));
      
      if (level === 0) {
        break; // Reached root level
      }
      
      let parentElement: HTMLElement | null = null;
      let prevSibling = currentElement.previousElementSibling;
      
      while (prevSibling) {
        const prevToggle = prevSibling.querySelector('.b3-list-item__toggle') as HTMLElement;
        const prevPadding = prevToggle ? parseInt(prevToggle.style.paddingLeft || '0') : 0;
        const prevLevel = Math.max(0, Math.floor(prevPadding / 18));
        
        if (prevLevel < level) {
          parentElement = prevSibling as HTMLElement;
          break;
        }
        prevSibling = prevSibling.previousElementSibling;
      }
      
      currentElement = parentElement;
    }
    
    console.log(`Built path for "${currentName}" (level ${currentLevel}):`, fullPath);
    return fullPath;
  }

  private getChildrenAtCurrentLevel(): Array<{
    element: HTMLElement;
    nodeId: string;
    name: string;
    level: number;
    hasChildren: boolean;
    isExpanded: boolean;
    parentNodeId?: string;
    path: string[];
  }> {
    const children: Array<{
      element: HTMLElement;
      nodeId: string;
      name: string;
      level: number;
      hasChildren: boolean;
      isExpanded: boolean;
      parentNodeId?: string;
      path: string[];
    }> = [];

    console.log(`Getting children at navigation level ${this.currentNavigationLevel}, path:`, this.currentNavigationPath);
    console.log('Current parent element:', this.currentParentElement);

    const docTrees = document.querySelectorAll('.b3-list--background');
    if (docTrees.length === 0) {
      console.warn('No document trees found');
      return children;
    }

    // For root level (level 0), show all notebooks
    if (this.currentNavigationLevel === 0) {
      docTrees.forEach((docTree) => {
        const items = docTree.querySelectorAll('li[data-type="navigation-file"], li[data-type="navigation-root"]');
        
        items.forEach((item) => {
          const element = item as HTMLElement;
          const nodeId = element.getAttribute('data-node-id') || '';
          const nameElement = element.querySelector('.b3-list-item__text');
          const name = nameElement?.textContent?.trim() || '';
          
          // Calculate level based on padding
          const toggle = element.querySelector('.b3-list-item__toggle') as HTMLElement;
          const paddingLeft = toggle ? parseInt(toggle.style.paddingLeft || '0') : 0;
          const visualLevel = Math.max(0, Math.floor(paddingLeft / 18));
          
          // Check if has children and is expanded
          const toggleButton = element.querySelector('.b3-list-item__toggle');
          const hasChildren = toggleButton && !toggleButton.classList.contains('fn__hidden');
          const arrow = toggleButton?.querySelector('.b3-list-item__arrow');
          const isExpanded = arrow && arrow.classList.contains('b3-list-item__arrow--open');

          // Only show root level items (notebooks)
          if (element.offsetParent !== null && visualLevel === 0) {
            const path = [name];
            children.push({
              element,
              nodeId,
              name,
              level: visualLevel,
              hasChildren: !!hasChildren,
              isExpanded: !!isExpanded,
              path
            });
            console.log(`Added root level item: ${name}`);
          }
        });
      });
    } 
    // For deeper levels, show only direct children of the selected parent
    else if (this.currentParentElement) {
      const targetLevel = this.currentNavigationLevel;
      let foundParent = false;
      
      docTrees.forEach((docTree) => {
        const items = docTree.querySelectorAll('li[data-type="navigation-file"], li[data-type="navigation-root"]');
        
        items.forEach((item) => {
          const element = item as HTMLElement;
          
          // Check if this is our parent element
          if (element === this.currentParentElement) {
            foundParent = true;
            console.log('Found parent element:', element);
            return;
          }
          
          // If we haven't found the parent yet, skip
          if (!foundParent) {
            return;
          }
          
          const nodeId = element.getAttribute('data-node-id') || '';
          const nameElement = element.querySelector('.b3-list-item__text');
          const name = nameElement?.textContent?.trim() || '';
          
          // Calculate level based on padding
          const toggle = element.querySelector('.b3-list-item__toggle') as HTMLElement;
          const paddingLeft = toggle ? parseInt(toggle.style.paddingLeft || '0') : 0;
          const visualLevel = Math.max(0, Math.floor(paddingLeft / 18));
          
          // Check if has children and is expanded
          const toggleButton = element.querySelector('.b3-list-item__toggle');
          const hasChildren = toggleButton && !toggleButton.classList.contains('fn__hidden');
          const arrow = toggleButton?.querySelector('.b3-list-item__arrow');
          const isExpanded = arrow && arrow.classList.contains('b3-list-item__arrow--open');

          // Only include items at the target level that are direct children
          if (element.offsetParent !== null && visualLevel === targetLevel) {
            const path = [...this.currentNavigationPath, name];
            children.push({
              element,
              nodeId,
              name,
              level: visualLevel,
              hasChildren: !!hasChildren,
              isExpanded: !!isExpanded,
              path
            });
            console.log(`Added child item: ${name} (level ${visualLevel})`);
          }
          // If we encounter an item at the same or lower level than parent, we've moved to next section
          else if (visualLevel <= this.currentNavigationLevel - 1) {
            foundParent = false;
            return;
          }
        });
      });
    }

    console.log(`Found ${children.length} children at current level`);
    return children;
  }

  private scanDocumentTree(): void {
    this.docTreeItems = this.getChildrenAtCurrentLevel();
    this.keyMappings.clear();

    this.docTreeItems.forEach((_, index) => {
      const keySequence = this.generateKeySequence(index);
      this.keyMappings.set(keySequence, index);
    });
  }

  private createKeyboardNavOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'keyboard-nav-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      color: white;
      font-family: monospace;
      overflow: auto;
    `;

    // Breadcrumb header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px;
      background: rgba(0, 0, 0, 0.9);
      border-bottom: 1px solid #444;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    // Breadcrumb path
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'breadcrumb-path';
    breadcrumb.style.cssText = `
      font-size: 16px;
      font-weight: bold;
      color: #007acc;
    `;
    
    if (this.currentNavigationPath.length > 0) {
      breadcrumb.textContent = this.currentNavigationPath.join(' > ');
    } else {
      breadcrumb.textContent = 'Root Level (Notebooks)';
    }

    // Instructions
    const instructions = document.createElement('div');
    instructions.style.cssText = `
      font-size: 14px;
      color: #ccc;
    `;
    instructions.textContent = 'Press key to open/expand document, BACKSPACE to go up level, ESC to exit';

    header.appendChild(breadcrumb);
    header.appendChild(instructions);

    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      padding: 20px;
      overflow: auto;
    `;

    // Multi-column grid container
    const gridContainer = document.createElement('div');
    const itemsPerColumn = Math.ceil(this.docTreeItems.length / 3); // 3 columns
    const columnCount = Math.min(3, Math.ceil(this.docTreeItems.length / Math.max(1, itemsPerColumn)));
    
    gridContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${columnCount}, 1fr);
      gap: 20px;
      align-items: start;
    `;

    // Create columns
    for (let col = 0; col < columnCount; col++) {
      const column = document.createElement('div');
      column.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
      `;

      const startIndex = col * itemsPerColumn;
      const endIndex = Math.min(startIndex + itemsPerColumn, this.docTreeItems.length);

      for (let i = startIndex; i < endIndex; i++) {
        const item = this.docTreeItems[i];
        const keySequence = this.generateKeySequence(i);

        const itemElement = document.createElement('div');
        itemElement.style.cssText = `
          padding: 12px 16px;
          display: flex;
          align-items: center;
          border: 1px solid #333;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          transition: background 0.2s;
          cursor: pointer;
        `;

        itemElement.addEventListener('mouseenter', () => {
          itemElement.style.background = 'rgba(0, 122, 204, 0.2)';
        });

        itemElement.addEventListener('mouseleave', () => {
          itemElement.style.background = 'rgba(255, 255, 255, 0.05)';
        });

        const keySpan = document.createElement('span');
        keySpan.style.cssText = `
          background: #007acc;
          color: white;
          padding: 6px 10px;
          border-radius: 4px;
          font-weight: bold;
          margin-right: 12px;
          min-width: 32px;
          text-align: center;
          flex-shrink: 0;
          font-size: 12px;
        `;
        keySpan.textContent = keySequence;

        const iconSpan = document.createElement('span');
        iconSpan.style.cssText = `
          margin-right: 8px;
          flex-shrink: 0;
          font-size: 16px;
          max-width: 1.6em;
          max-height: 1.6em;
          width: 1.6em;
          height: 1.6em;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        `;
        
        // Get the icon from the original element
        const originalIcon = item.element.querySelector('.b3-list-item__icon');
        if (originalIcon) {
          iconSpan.innerHTML = originalIcon.innerHTML;
          // 限制svg/img等子元素的大小，避免过大
          const svg = iconSpan.querySelector('svg');
          if (svg) {
            svg.style.maxWidth = '1.4em';
            svg.style.maxHeight = '1.4em';
            svg.style.width = '1.4em';
            svg.style.height = '1.4em';
            svg.style.display = 'block';
          }
          const img = iconSpan.querySelector('img');
          if (img) {
            img.style.maxWidth = '1.4em';
            img.style.maxHeight = '1.4em';
            img.style.width = '1.4em';
            img.style.height = '1.4em';
            img.style.display = 'block';
          }
        } else {
          iconSpan.textContent = item.hasChildren ? (item.isExpanded ? '📂' : '📁') : '📄';
        }

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = `
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
        `;
        nameSpan.textContent = item.name;
        
        const statusSpan = document.createElement('span');
        statusSpan.style.cssText = `
          margin-left: 8px;
          font-size: 11px;
          color: #888;
          flex-shrink: 0;
        `;
        if (item.hasChildren) {
          statusSpan.textContent = item.isExpanded ? '(expanded)' : '(collapsed)';
        }

        itemElement.appendChild(keySpan);
        itemElement.appendChild(iconSpan);
        itemElement.appendChild(nameSpan);
        itemElement.appendChild(statusSpan);
        column.appendChild(itemElement);
      }

      gridContainer.appendChild(column);
    }

    content.appendChild(gridContainer);
    overlay.appendChild(header);
    overlay.appendChild(content);

    return overlay;
  }

  private showKeyboardNavigation(): void {
    if (this.keyboardNavActive) return;

    // Reset navigation state
    this.currentNavigationPath = [];
    this.currentNavigationLevel = 0;
    this.currentParentElement = null;

    this.scanDocumentTree();
    this.keyboardNavOverlay = this.createKeyboardNavOverlay();
    document.body.appendChild(this.keyboardNavOverlay);
    this.keyboardNavActive = true;

    // Add keyboard event listener
    document.addEventListener('keydown', this.keyboardNavigationHandler);
  }

  private hideKeyboardNavigation(): void {
    if (!this.keyboardNavActive) return;

    if (this.keyboardNavOverlay) {
      document.body.removeChild(this.keyboardNavOverlay);
      this.keyboardNavOverlay = null;
    }
    
    // Reset sequence state
    this.currentKeySequence = "";
    if (this.keySequenceTimeout) {
      clearTimeout(this.keySequenceTimeout);
      this.keySequenceTimeout = null;
    }
    
    this.keyboardNavActive = false;
    document.removeEventListener('keydown', this.keyboardNavigationHandler);
  }

  // Store the bound handler to properly remove it
  private keyboardNavigationHandler = this.handleKeyboardNavigation.bind(this);

  private handleKeyboardNavigation(event: KeyboardEvent): void {
    if (!this.keyboardNavActive) return;

    // ESC to exit
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hideKeyboardNavigation();
      return;
    }

    // BACKSPACE to go up one level
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.navigateUpLevel();
      return;
    }

    // Only handle a-z keys for item selection
    const key = event.key.toLowerCase();
    if (!/^[a-z]$/.test(key)) {
      return;
    }

    event.preventDefault();

    // Clear any existing timeout
    if (this.keySequenceTimeout) {
      clearTimeout(this.keySequenceTimeout);
    }

    // Add to current sequence
    this.currentKeySequence += key;

    // Check for exact match
    if (this.keyMappings.has(this.currentKeySequence)) {
      const index = this.keyMappings.get(this.currentKeySequence)!;
      this.executeKeyboardAction(index);
      this.currentKeySequence = "";
      return;
    }

    // Check if this sequence could be the start of a valid sequence
    const hasPartialMatch = Array.from(this.keyMappings.keys()).some(
      mapping => mapping.startsWith(this.currentKeySequence)
    );

    if (hasPartialMatch) {
      // Set timeout to reset sequence if no more keys pressed
      this.keySequenceTimeout = window.setTimeout(() => {
        this.currentKeySequence = "";
        this.updateKeySequenceDisplay();
      }, 2000);
      
      this.updateKeySequenceDisplay();
    } else {
      // No partial match, reset
      this.currentKeySequence = "";
      this.updateKeySequenceDisplay();
    }
  }

  private navigateUpLevel(): void {
    if (this.currentNavigationPath.length > 0) {
      const removedItem = this.currentNavigationPath.pop();
      this.currentNavigationLevel = Math.max(0, this.currentNavigationLevel - 1);
      
      // Reset parent element - we need to find the new parent
      if (this.currentNavigationLevel === 0) {
        this.currentParentElement = null; // Back to root level
      } else {
        // Find the parent element for the current path
        this.currentParentElement = this.findElementByPath(this.currentNavigationPath);
      }
      
      console.log(`Navigated up from: ${removedItem}, new level: ${this.currentNavigationLevel}, new path:`, this.currentNavigationPath);
      console.log('New parent element:', this.currentParentElement);
      this.refreshKeyboardNavigation();
    } else {
      console.log('Already at root level, cannot go up');
    }
  }

  private findElementByPath(path: string[]): HTMLElement | null {
    if (path.length === 0) return null;
    
    const docTrees = document.querySelectorAll('.b3-list--background');
    for (const docTree of docTrees) {
      const items = docTree.querySelectorAll('li[data-type="navigation-file"], li[data-type="navigation-root"]');
      
      for (const item of items) {
        const element = item as HTMLElement;
        const nameElement = element.querySelector('.b3-list-item__text');
        const name = nameElement?.textContent?.trim() || '';
        
        // Check if this element matches the last item in our path
        if (name === path[path.length - 1]) {
          // We found a potential match, but we need to verify the full path
          // For now, return this element (could be improved with full path verification)
          return element;
        }
      }
    }
    
    return null;
  }

  private navigateToChild(item: {
    element: HTMLElement;
    nodeId: string;
    name: string;
    level: number;
    hasChildren: boolean;
    isExpanded: boolean;
    parentNodeId?: string;
    path: string[];
  }): void {
    if (item.hasChildren) {
      // Set the current element as the parent for next level
      this.currentParentElement = item.element;
      
      // Add the current item name to our path
      this.currentNavigationPath.push(item.name);
      // Move to next level
      this.currentNavigationLevel = item.level + 1;
      
      console.log(`Navigating to child: ${item.name}, new level: ${this.currentNavigationLevel}, new path:`, this.currentNavigationPath);
      console.log('New parent element:', this.currentParentElement);
      
      // If not expanded, expand it first
      if (!item.isExpanded) {
        this.expandSubfolder(item.element);
        // Wait for expansion then refresh
        setTimeout(() => {
          this.refreshKeyboardNavigation();
        }, 200);
      } else {
        this.refreshKeyboardNavigation();
      }
    }
  }

  private updateKeySequenceDisplay(): void {
    if (!this.keyboardNavOverlay) return;
    
    const header = this.keyboardNavOverlay.querySelector('div div:nth-child(2)') as HTMLElement;
    if (!header) return;

    if (this.currentKeySequence) {
      header.textContent = `Current sequence: "${this.currentKeySequence}" (BACKSPACE to go up level, ESC to exit)`;
    } else {
      header.textContent = 'Press key to open/expand document, BACKSPACE to go up level, ESC to exit';
    }
  }

  private executeKeyboardAction(index: number): void {
    console.log(this.currentKeySequence);
    const item = this.docTreeItems[index];
    if (!item) return;

    if (item.hasChildren) {
      // If it has children, navigate into it
      this.navigateToChild(item);
    } else {
      // If it's a document, open it and close interface
      this.hideKeyboardNavigation();
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(clickEvent, "sf_openDoc", {
        value: true,
      });
      item.element.dispatchEvent(clickEvent);
    }
  }

  private refreshKeyboardNavigation(): void {
    if (!this.keyboardNavActive) return;
    
    // Rescan the document tree and update the display
    this.scanDocumentTree();
    
    // Update the overlay content
    if (this.keyboardNavOverlay) {
      // Remove old overlay and create new one
      document.body.removeChild(this.keyboardNavOverlay);
      this.keyboardNavOverlay = this.createKeyboardNavOverlay();
      document.body.appendChild(this.keyboardNavOverlay);
    }
    
    // Reset current key sequence
    this.currentKeySequence = "";
    this.updateKeySequenceDisplay();
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
      key: "enable_keyboard_navigation",
      value: true,
      type: "checkbox",
      title: "Enable Keyboard Navigation",
      description: "Enable keyboard navigation interface for quick document access. Use a-z keys to navigate, then ab, ac, etc. for more items.",
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

    // Add standalone keyboard navigation button if enabled
    if (this.settingUtils.get("enable_keyboard_navigation")) {
      this.addTopBar({
        icon: "iconDoctreeFakeSubfolderKeyboardMode",
        title: "Keyboard Navigation",
        position: "left",
        callback: () => {
          if (this.keyboardNavActive) {
            this.hideKeyboardNavigation();
          } else {
            this.showKeyboardNavigation();
          }
        },
      });
    }
  }

  async onunload() {
    // Clean up keyboard navigation if active
    if (this.keyboardNavActive) {
      this.hideKeyboardNavigation();
    }
  }

  uninstall() { }
}
