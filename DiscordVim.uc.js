// ==UserScript==
// @name         Discord Vim Navigation
// @version      3.0
// @description  Vim-like Discord navigation.
//               j/k              navigate messages
//               o                if the message has a link or image, open the first one
//               p                if the selected message is a reply, go to its parent
//                                (if you have permission to pin messages, use Ctrl+p instead to avoid triggering pin functionality)
//               i                focus on textbox
//               Esc/Ctrl+[       select the last message in the channel, or escape the image viewer if it's open
//               Alt+j/k          navigate channels
//               Alt+Shift+j/k    navigate unread channels
//               Alt+Ctrl+j/k     navigate servers
// @author       @chika.chika
// @match        https://discord.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=discord.com
// @grant        none
// ==/UserScript==
(() => {
  const SELECTORS = {
    appMount: '#app-mount',
    selectedMsg: '[class*="message"][class*="selected"]',
    hasReply: 'div[class*="selected"][class*="hasReply"]',
    chatMessages: '[data-list-item-id^="chat-messages"]',
    chatContainer: 'div[class*="chat"]',
    scrollerInner: '[class*="scrollerInner"]',
    textEditor: '[class*="editor"][class*="slateTextArea"]',
    textbox: 'div[role="textbox"]',
    backdrop: '[class*="backdrop"]',
    jumpButton: '[class*="barButtonMain"]',
    replyPreview: 'div[class*="repliedTextPreview"]'
  };

  const TIMING = {
    focusDelay: 25,
    keyDispatch: 5,
    animationBuffer: 1000
  };

  // Check if user is currently typing in an input field
  const isInputActive = () => {
    const active = document.activeElement;
    return active.isContentEditable || active.nodeName === 'INPUT' || active.nodeName === 'TEXTAREA';
  };

  const getSelectedMessage = () => document.querySelector(SELECTORS.selectedMsg);

  const dispatchNavKey = (target, direction) => {
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: direction === 'down' ? 'ArrowDown' : 'ArrowUp',
      bubbles: true,
      keyCode: direction === 'down' ? 40 : 38
    }));
  };

  // Press Esc or Ctrl+[ to focus on the last message in the channel
  const focusLastMessage = () => {
    const jumpBtn = document.querySelector(SELECTORS.jumpButton);
    if (jumpBtn) {
      jumpBtn.click();
      return;
    }

    const lastItem = document.querySelector(`${SELECTORS.scrollerInner} > *:nth-last-child(2)`);
    if (!lastItem) return;
    lastItem.scrollIntoView();

    const editor = document.querySelector(SELECTORS.textEditor);
    if (!editor) return;

    editor.focus();
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

    setTimeout(() => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, keyCode: 38 }));
    }, TIMING.keyDispatch);
  };

  // Press i to return to the text box
  const focusTextbox = () => {
    const el = document.querySelector(SELECTORS.textbox);
    if (!el) return;
    el.focus();
    // Place cursor at end of textbox
    if (el.textContent.length > 0 && el.textContent !== '\ufeff') {
      setTimeout(() => window.getSelection().collapse(el, 1), TIMING.focusDelay);
    }
  };

  // Navigate between messages
  const navigateMessage = (direction) => {
    if (isInputActive()) return;
    const selected = getSelectedMessage();
    // Prevent this movement from going down to the textbox
    if (direction === 'down' && selected === [...document.querySelectorAll(SELECTORS.chatMessages)].pop()) return;
    dispatchNavKey(selected || document.querySelector(SELECTORS.appMount), direction);
  };

  // Press o to open a link or attachment
  const openAttachment = () => {
    const selected = getSelectedMessage();
    if (!selected) return;

    const selectors = [
      'div[aria-label="Play"][role="button"]', // video
      'a[class*="anchor"]',                     // link
      '[class*="clickableWrapper"]'            // image
    ];

    for (const sel of selectors) {
      const el = selected.querySelector(sel);
      if (el && !el.parentElement.matches('[class*="repliedTextContent"]')) {
        el.click();
        break;
      }
    }
  };

  // Press p to go to a reply's parent
  const jumpToParent = (e) => {
    const selected = document.querySelector(SELECTORS.hasReply);
    if (!selected || isInputActive()) return;

    e.preventDefault();
    const replyBtn = selected.querySelector(SELECTORS.replyPreview);
    if (!replyBtn) return;

    const replyId = replyBtn.children[0]?.id.split('-').pop();
    replyBtn.click();

    setTimeout(() => {
      document.querySelector(`[id*="chat-messages"][id*="${replyId}"]`)?.children[0]?.focus();
    }, TIMING.animationBuffer);
  };

  // Automatically focus on the last message in the channel after switching channels
  const channelSwitchStart = new MutationObserver((mutations, observer) => {
    // Trigger on any removed nodes
    const removed = [...mutations[0].removedNodes];
    if (removed.length > 0) {
      setTimeout(() => {
        const chat = document.querySelector(SELECTORS.chatContainer);
        if (chat) channelSwitchEnd.observe(chat, { childList: true, subtree: true });
      }, TIMING.focusDelay);
      observer.disconnect();
    }
  });


  const channelSwitchEnd = new MutationObserver((_, observer) => {
    if (document.querySelector('[data-list-id="chat-messages"] li')) {
      setTimeout(() => {
        const lastItem = document.querySelector(`${SELECTORS.scrollerInner} > *:nth-last-child(2)`);
        const editor = document.querySelector(SELECTORS.textEditor);
        if (!lastItem || !editor) return;

        lastItem.scrollIntoView();
        editor.focus();
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        setTimeout(() => {
          editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, keyCode: 38 }));
        }, TIMING.keyDispatch);
      }, TIMING.focusDelay);
      observer.disconnect();
    }
  });


  document.querySelector(SELECTORS.appMount).addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // Allow quick switcher
    if (e.ctrlKey && key === 'k') return;

    // Prevent Discord from changing focus to textbox
    if (!e.altKey && 'jkop'.includes(key)) e.stopImmediatePropagation();
    if (isInputActive()) return;

    if (key === 'j') navigateMessage('down');
    else if (key === 'k') navigateMessage('up');
    else if (key === 'o') openAttachment();
    else if (key === 'p') jumpToParent(e);
  });

  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (e.altKey) {
      // Navigate forward and backward in history
      if (key === 'h') history.back();
      else if (key === 'l') history.forward();
      else if (key === 'j' || key === 'k') {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: key === 'j' ? 'ArrowDown' : 'ArrowUp',
          keyCode: key === 'j' ? 40 : 38,
          which: key === 'j' ? 40 : 38,
          bubbles: true,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey
        }));
        const chat = document.querySelector(SELECTORS.chatContainer);
        if (chat) channelSwitchStart.observe(chat, { childList: true, subtree: true });
      }
      return;
    }

    // Press i to return to the text box
    if (key === 'i' && !isInputActive() && !(e.ctrlKey && e.shiftKey)) {
      e.preventDefault();
      focusTextbox();
      return;
    }

    // If an image is currently open, use Ctrl+[ to go back to messages
    // Press Esc or Ctrl+[ to focus on the last message in the channel
    if (e.key === 'Escape' || (e.ctrlKey && e.key === '[')) {
      const backdrop = document.querySelector(SELECTORS.backdrop);
      if (backdrop) {
        backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', which: 27, bubbles: true }));
      } else {
        focusLastMessage();
      }
    }
  });

  // Optional focus ring styling (skinnier, rounder, milder color)
  const style = document.createElement('style');
  style.textContent = `
    .focus-rings-ring {
      box-shadow: 0 0 0 3px #7ba6d1 !important;
      border-radius: 8px !important;
    }
  `;
  document.head.appendChild(style);
})();
