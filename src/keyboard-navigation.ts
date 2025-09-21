import { DocTreeItem } from "./types";
import { expandSubfolder } from "./utils";

export class KeyboardNavigationManager {
  private keyboardNavActive: boolean = false;
  private keyboardNavOverlay: HTMLElement | null = null;
  private docTreeItems: DocTreeItem[] = [];
  private keyMappings: Map<string, number> = new Map();
  private currentKeySequence: string = "";
  private keySequenceTimeout: number | null = null;
  private currentNavigationPath: string[] = [];
  private currentNavigationLevel: number = 0;
  private currentParentElement: HTMLElement | null = null;

  // Keyboard navigation methods
  private generateKeySequence(index: number): string {
    if (index < 26) {
      return String.fromCharCode(97 + index); // a-z
    }
    
    const firstChar = Math.floor((index - 26) / 26);
    const secondChar = (index - 26) % 26;
    return String.fromCharCode(97 + firstChar) + String.fromCharCode(97 + secondChar);
  }

  private getChildrenAtCurrentLevel(): DocTreeItem[] {
    const children: DocTreeItem[] = [];

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

  showKeyboardNavigation(): void {
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

  hideKeyboardNavigation(): void {
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

  private navigateToChild(item: DocTreeItem): void {
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
        expandSubfolder(item.element);
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

  isActive(): boolean {
    return this.keyboardNavActive;
  }
}
