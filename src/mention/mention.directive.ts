import { Directive, ElementRef, Input, ComponentFactoryResolver, ViewContainerRef, TemplateRef } from '@angular/core';
import { EventEmitter, Output, OnInit, OnChanges, SimpleChanges } from '@angular/core';

import { MentionListComponent } from './mention-list.component';
import { getValue, insertValue, getCaretPosition, setCaretPosition } from './mention-utils';
import { MentionItem } from './mention-item';

const KEY_BACKSPACE = 8;
const KEY_TAB = 9;
const KEY_ENTER = 13;
const KEY_SHIFT = 16;
const KEY_ESCAPE = 27;
const KEY_LEFT = 37;
const KEY_UP = 38;
const KEY_RIGHT = 39;
const KEY_DOWN = 40;
const KEY_BUFFERED = 229;

/**
 * Angular 2 Mentions.
 * https://github.com/dmacfarlane/angular-mentions
 *
 * Copyright (c) 2017 Dan MacFarlane
 */
@Directive({
  selector: '[mentions]',
  host: {
    '(keydown)': 'keyHandler($event)',
    '(textInput)': 'textInputHandler($event)',
    '(blur)': 'blurHandler($event)'
  }
})
export class MentionDirective implements OnInit, OnChanges {

  @Input() set mentions(mentionItems: Array<MentionItem>) {
    this.mentionItems = mentionItems;
  }

  @Input() set isEmptyTrigger(isEmptyTrigger: boolean) {
    this.withEmptyTrigger = isEmptyTrigger;
  }

  // event emitted whenever the search term changes
  @Output() searchTerm = new EventEmitter();

  // Outputs on selected term
  @Output() selectedTerm = new EventEmitter();

  @Output() triggeredChar = new EventEmitter<string>();

  // the character that will trigger the menu behavior
  private defaultTriggerChar = '@';

  // option to specify the field in the objects to be used as the item label
  private defaultLabelKey = 'label';

  // option to diable internal filtering. can be used to show the full list returned
  // from an async operation (or allows a custom filter function to be used - in future)
  private defaultDisableSearch = false;

  // option to limit the number of items shown in the pop-up menu
  private defaultMaxItems = -1;

  // Function formatter
  // private mentionSelect = function (item) { return this.lastMentionItem.triggerChar + this.lastMentionItem.searchList.activeItem[this.lastMentionItem.labelKey]; };
  private mentionSelect: (item: any) => (string) = ((item: any) => {
    return this.lastMentionItem.triggerChar + item[this.lastMentionItem.labelKey];
  });

  searchString: string;
  startPos: number;
  mentionItems: Array<MentionItem>
  startNode;
  stopSearch: boolean;
  lastKeyCode: number;
  iframe: any; // optional
  keyCodeSpecified: boolean;
  lastMentionItem: MentionItem;
  withEmptyTrigger: boolean;

  constructor(
    private _element: ElementRef,
    private _componentResolver: ComponentFactoryResolver,
    private _viewContainerRef: ViewContainerRef
  ) { }

  setMentionItemDefaults() {
    for (const mentionItem of this.mentionItems) {
      mentionItem.triggerChar = mentionItem.triggerChar !== null ? mentionItem.triggerChar : this.defaultTriggerChar;

      mentionItem.labelKey = mentionItem.labelKey || this.defaultLabelKey;
      mentionItem.disableSearch = mentionItem.disableSearch || this.defaultDisableSearch;
      mentionItem.maxItems = mentionItem.maxItems || this.defaultMaxItems;
      // mentionItem.mentionSelect = mentionItem.mentionSelect || this.mentionSelect;
    }
  }

  convertStringsToObjects() {
    for (const mentionItem of this.mentionItems) {
      if (typeof mentionItem.items[0] == 'string') {
        mentionItem.items = mentionItem.items.map((label) => {
          const object = {};
          object[mentionItem.labelKey] = label;
          return object;
        });
      }

      // remove items without an labelKey (as it's required to filter the list)
      mentionItem.items = mentionItem.items.filter(e => e[mentionItem.labelKey]);
      mentionItem.items.sort((a, b) => a[mentionItem.labelKey].localeCompare(b[mentionItem.labelKey]));
    }
  }

  textInputHandler(event: any, nativeElement: HTMLInputElement = this._element.nativeElement) {
    if (this.lastKeyCode === KEY_BUFFERED) {
      let keyCode = event.data.charCodeAt(0);
      this.keyHandler({keyCode:keyCode}, nativeElement);
    }
  }


  ngOnInit() {
    this.setMentionItemDefaults();
    this.convertStringsToObjects();

    this.setEmptyTrigger(false);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mentions']) {
      this.ngOnInit();
    }
  }

  setEmptyTrigger(show: boolean = true): void {
    if (this.withEmptyTrigger) {
      this.lastMentionItem = this.mentionItems.find((item) => item.triggerChar === '');

      if (this.lastMentionItem && show) {
        this.showSearchList(this.lastMentionItem, this._element.nativeElement);
        this.updateSearchList(this.lastMentionItem);
      }
    }
  }

  setIframe(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
  }

  stopEvent(event: any) {
    // if (event instanceof KeyboardEvent) { // does not work for iframe
    if (!event.wasClick) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  blurHandler(event: any) {
    this.stopEvent(event);
    this.stopSearch = true;
    if (this.lastMentionItem && this.lastMentionItem.searchList) {
      this.lastMentionItem.searchList.hidden = true;
    }
  }

  keyHandler(event: any, nativeElement: HTMLInputElement = this._element.nativeElement) {
    this.lastKeyCode = event.keyCode;
    const val: string = getValue(nativeElement);
    let pos = getCaretPosition(nativeElement, this.iframe);
    let charPressed = this.keyCodeSpecified ? event.keyCode : event.key;
    if (!charPressed) {
      const charCode = event.which || event.keyCode;
      if (!event.shiftKey && (charCode >= 65 && charCode <= 90)) {
        charPressed = String.fromCharCode(charCode + 32);
      } else {
        // TODO (dmacfarlane) fix this for non-alpha keys
        // http://stackoverflow.com/questions/2220196/how-to-decode-character-pressed-from-jquerys-keydowns-event-handler?lq=1
        charPressed = String.fromCharCode(event.which || event.keyCode);
      }
    }
    if ((event.keyCode == KEY_TAB || (event.keyCode == KEY_ENTER && event.wasClick)) && pos < this.startPos) {
      // put caret back in position prior to contenteditable menu click
      pos = this.startNode.length;
      setCaretPosition(this.startNode, pos, this.iframe);
    }
    // console.log("keyHandler", this.startPos, pos, val, charPressed, event);

    let mentionItem: MentionItem = this.getMentionItemFromCharPressed(charPressed);

    if (!mentionItem && charPressed !== ' ' && charPressed !== null && this.withEmptyTrigger && !nativeElement.value
      && event.keyCode !== KEY_ENTER && !event.wasClick && event.keyCode !== KEY_TAB
      && event.keyCode !== KEY_DOWN && event.keyCode !== KEY_UP) {
      mentionItem = this.getMentionItemFromCharPressed('');
    }

    if ((mentionItem && charPressed !== ' ') || (mentionItem && charPressed === ' ' &&
      (nativeElement.value.endsWith(',') || nativeElement.value.endsWith('+')))) {
      this.lastMentionItem = mentionItem;

      if (charPressed !== ' ' && charPressed !== null && this.withEmptyTrigger && !nativeElement.value) {
        this.stopSearch = false;
        this.searchString = charPressed;
      } else {
        this.stopSearch = false;
        this.searchString = null;
      }
      // if (charPressed == this.triggerChar) {
      this.startPos = pos;
      this.startNode = (this.iframe ? this.iframe.contentWindow.getSelection() : window.getSelection()).anchorNode;

      this.showSearchList(mentionItem, nativeElement);
      this.updateSearchList(mentionItem);
    } else if ((this.startPos >= 0 && !this.stopSearch) ||
      this.withEmptyTrigger) {

      if (this.startPos === 0 && this.withEmptyTrigger && this.lastMentionItem.triggerChar === ''
        && event.keyCode !== KEY_ENTER && event.keyCode !== KEY_TAB && event.keyCode !== KEY_DOWN
        && event.keyCode !== KEY_UP && !event.wasClick) {
        this.searchString = nativeElement.value + charPressed;
        this.setEmptyTrigger();
      } else if (pos <= this.startPos && !this.withEmptyTrigger) {
        this.lastMentionItem.searchList.hidden = true;
      } else if (event.keyCode !== KEY_SHIFT &&
        !event.metaKey &&
        !event.altKey &&
        !event.ctrlKey &&
        (pos > this.startPos || this.withEmptyTrigger)
      ) {
        if (event.keyCode === KEY_BACKSPACE && pos > 0) {
          pos--;
          if (pos == 0) {
            this.stopSearch = true;
          }
          this.lastMentionItem.searchList.hidden = this.stopSearch;
        } else if (this.lastMentionItem && !this.lastMentionItem.searchList.hidden) {
          if (event.keyCode === KEY_TAB || event.keyCode === KEY_ENTER) {
            this.stopEvent(event);
            this.lastMentionItem.searchList.hidden = true;
            // value is inserted without a trailing space for consistency
            // between element types (div and iframe do not preserve the space)

            // if (nativeElement.value && this.lastMentionItem.triggerChar === "") {
            //   this.startPos = nativeElement.value.lastIndexOf(charPressed.trim());
            //   pos = nativeElement.value.lastIndexOf(charPressed.trim());
            // }
            // if mentionSelect is overridden
            if (!this.iframe && (this.startPos < 0 || this.startPos === undefined)) {
              this.startPos = 0;
              pos = this.lastMentionItem.searchList.activeItem[this.lastMentionItem.searchList.labelKey] ?
                this.lastMentionItem.searchList.activeItem[this.lastMentionItem.searchList.labelKey].length + 1
                : 0;
            }

            if (this.lastMentionItem.mentionSelect) {
              insertValue(nativeElement, this.startPos, pos, this.lastMentionItem.mentionSelect(this.lastMentionItem.searchList.activeItem), this.iframe);
            } else {
              // default method
              insertValue(nativeElement, this.startPos, pos, this.mentionSelect(this.lastMentionItem.searchList.activeItem), this.iframe);
            }

            this.selectedTerm.emit(this.lastMentionItem.searchList.activeItem);
            // fire input event so angular bindings are updated
            if ('createEvent' in document) {
              const evt = document.createEvent('HTMLEvents');
              evt.initEvent('input', false, true);
              nativeElement.dispatchEvent(evt);
            }
            this.startPos = -1;

            // if (this.withEmptyTrigger) {
            //   this.setEmptyTrigger();
            // }
            return false;
          } else if (event.keyCode === KEY_ESCAPE) {
            this.stopEvent(event);
            this.lastMentionItem.searchList.hidden = true;
            this.stopSearch = true;
            return false;
          } else if (event.keyCode === KEY_DOWN) {
            this.stopEvent(event);
            this.lastMentionItem.searchList.activateNextItem();
            return false;
          } else if (event.keyCode === KEY_UP) {
            this.stopEvent(event);
            this.lastMentionItem.searchList.activatePreviousItem();
            return false;
          }
        }

        if (event.keyCode === KEY_LEFT || event.keyCode === KEY_RIGHT) {
          this.stopEvent(event);
          return false;
        } else {
          let mention = val.substring(this.startPos + 1, pos);
          if (event.keyCode !== KEY_BACKSPACE) {
            mention += charPressed;
          }

          this.searchString = mention;
          this.searchTerm.emit(this.searchString);

          if (event.keyCode === KEY_BACKSPACE && this.withEmptyTrigger && (pos === 0 || mention === '') &&
            (nativeElement.value.endsWith(' ') || nativeElement.value.endsWith(','))) {
            this.setEmptyTrigger();
          }

          this.showSearchList(this.lastMentionItem, this._element.nativeElement);
          this.updateSearchList(this.lastMentionItem);
        }
      }
    }
  }

  getMentionItemFromCharPressed(charPressed) {
    return this.mentionItems.find((mention) => mention.triggerChar === charPressed);
  }

  updateSearchList(mentionItem: MentionItem) {
    let matches: any[] = [];
    if (mentionItem.items) {
      let objects = mentionItem.items;
      // disabling the search relies on the async operation to do the filtering
      if (!mentionItem.disableSearch && this.searchString) {
        const searchStringLowerCase = this.searchString.toLowerCase();
        objects = mentionItem.items.filter(e => e[mentionItem.labelKey].toLowerCase().startsWith(searchStringLowerCase));
      }
      matches = objects;
      if (mentionItem.maxItems > 0) {
        matches = matches.slice(0, mentionItem.maxItems);
      }
    }
    // update the search list
    if (mentionItem && mentionItem.searchList) {
      mentionItem.searchList.items = matches;
      mentionItem.searchList.hidden = matches.length == 0;
    }
  }

  showSearchList(mentionItem: MentionItem, nativeElement: HTMLInputElement) {
    for (const listedItem of this.mentionItems) {
      if (listedItem.searchList) {
        listedItem.searchList.hidden = true;
      }
    }

    if (mentionItem.searchList == null) {
      const componentFactory = this._componentResolver.resolveComponentFactory(MentionListComponent);
      const componentRef = this._viewContainerRef.createComponent(componentFactory);
      mentionItem.searchList = componentRef.instance;
      mentionItem.searchList.position(nativeElement, this.iframe);
      mentionItem.searchList.itemTemplate = mentionItem.mentionListTemplate;
      mentionItem.searchList.labelKey = mentionItem.labelKey;
      componentRef.instance['itemClick'].subscribe(() => {
        nativeElement.focus();
        const fakeKeydown = { 'keyCode': KEY_ENTER, 'wasClick': true };
        this.keyHandler(fakeKeydown, nativeElement);
      });
      this.triggeredChar.emit(mentionItem.triggerChar);
    } else {
      mentionItem.searchList.activeIndex = 0;
      mentionItem.searchList.position(nativeElement, this.iframe);
      window.setTimeout(() => mentionItem.searchList.resetScroll());
      this.triggeredChar.emit(mentionItem.triggerChar);
    }
  }
}
