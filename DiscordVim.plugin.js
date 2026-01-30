/**
 * @name DiscordVim
 * @author @chika.chika
 * @description  Vim-like Discord navigation.
 *               j/k              navigate messages
 *               o                if the message has a link or image, open the first one
 *               p                if the selected message is a reply, go to its parent
 *                                (if you have permission to pin messages, use Ctrl+p instead to avoid triggering pin functionality)
 *               i                focus on textbox
 *               Esc/Ctrl+[       select the last message in the channel, or escape the image viewer if it's open
 *               Alt+j/k          navigate channels
 *               Alt+Shift+j/k    navigate unread channels
 *               Alt+Ctrl+j/k     navigate servers
 * @version 3.0
 */
module.exports = class DiscordVim {

    constructor() {
        // CSS selectors used throughout the script
        this.SELECTORS = {
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

        this.TIMING = {
            focusDelay: 25,
            keyDispatch: 5,
            animationBuffer: 1000
        };

        // Store observers for cleanup
        this.channelSwitchStart = null;
        this.channelSwitchEnd = null;
        this.styleElement = null;

        // Check if user is currently typing in an input field
        this.isInputActive = () => {
            const active = document.activeElement;
            return active.isContentEditable || active.nodeName === 'INPUT' || active.nodeName === 'TEXTAREA';
        };

        this.getSelectedMessage = () => document.querySelector(this.SELECTORS.selectedMsg);

        this.dispatchNavKey = (target, direction) => {
            target.dispatchEvent(new KeyboardEvent('keydown', {
                key: direction === 'down' ? 'ArrowDown' : 'ArrowUp',
                bubbles: true,
                keyCode: direction === 'down' ? 40 : 38
            }));
        };

        // Press Esc or Ctrl+[ to focus on the last message in the channel
        this.focusLastMessage = () => {
            const jumpBtn = document.querySelector(this.SELECTORS.jumpButton);
            if (jumpBtn) {
                jumpBtn.click();
                return;
            }

            const lastItem = document.querySelector(`${this.SELECTORS.scrollerInner} > *:nth-last-child(2)`);
            if (!lastItem) return;
            lastItem.scrollIntoView();

            const editor = document.querySelector(this.SELECTORS.textEditor);
            if (!editor) return;

            editor.focus();
            editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

            setTimeout(() => {
                editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, keyCode: 38 }));
            }, this.TIMING.keyDispatch);
        };

        // Press i to return to the text box
        this.focusTextbox = () => {
            const el = document.querySelector(this.SELECTORS.textbox);
            if (!el) return;
            el.focus();
            // Place cursor at end of textbox
            if (el.textContent.length > 0 && el.textContent !== '\ufeff') {
                setTimeout(() => window.getSelection().collapse(el, 1), this.TIMING.focusDelay);
            }
        };

        // Navigate between messages
        this.navigateMessage = (direction) => {
            if (this.isInputActive()) return;
            const selected = this.getSelectedMessage();
            // Prevent this movement from going down to the textbox
            if (direction === 'down' && selected === [...document.querySelectorAll(this.SELECTORS.chatMessages)].pop()) return;
            this.dispatchNavKey(selected || document.querySelector(this.SELECTORS.appMount), direction);
        };

        // Press o to open a link or attachment
        this.openAttachment = () => {
            const selected = this.getSelectedMessage();
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
        this.jumpToParent = (e) => {
            const selected = document.querySelector(this.SELECTORS.hasReply);
            if (!selected || this.isInputActive()) return;

            e.preventDefault();
            const replyBtn = selected.querySelector(this.SELECTORS.replyPreview);
            if (!replyBtn) return;

            const replyId = replyBtn.children[0]?.id.split('-').pop();
            replyBtn.click();

            setTimeout(() => {
                document.querySelector(`[id*="chat-messages"][id*="${replyId}"]`)?.children[0]?.focus();
            }, this.TIMING.animationBuffer);
        };

        // Automatically focus on the last message in the channel after switching channels
        this.setupChannelSwitchObserver = () => {
            this.channelSwitchStart = new MutationObserver((mutations, observer) => {
                // Trigger on any removed nodes (preserves original behavior)
                const removed = [...mutations[0].removedNodes];
                if (removed.length > 0) {
                    setTimeout(() => {
                        const chat = document.querySelector(this.SELECTORS.chatContainer);
                        if (chat) this.channelSwitchEnd.observe(chat, { childList: true, subtree: true });
                    }, this.TIMING.focusDelay);
                    observer.disconnect();
                }
            });

            this.channelSwitchEnd = new MutationObserver((_, observer) => {
                if (document.querySelector('[data-list-id="chat-messages"] li')) {
                    setTimeout(() => {
                        const lastItem = document.querySelector(`${this.SELECTORS.scrollerInner} > *:nth-last-child(2)`);
                        const editor = document.querySelector(this.SELECTORS.textEditor);
                        if (!lastItem || !editor) return;

                        lastItem.scrollIntoView();
                        editor.focus();
                        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
                        setTimeout(() => {
                            editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, keyCode: 38 }));
                        }, this.TIMING.keyDispatch);
                    }, this.TIMING.focusDelay);
                    observer.disconnect();
                }
            });
        };

        // Handler for #app-mount keydown (j/k/o/p navigation)
        this.handleAppKeydown = (e) => {
            const key = e.key.toLowerCase();

            // Allow quick switcher
            if (e.ctrlKey && key === 'k') return;

            // Prevent Discord from changing focus to textbox
            if (!e.altKey && 'jkop'.includes(key)) e.stopImmediatePropagation();
            if (this.isInputActive()) return;

            if (key === 'j') this.navigateMessage('down');
            else if (key === 'k') this.navigateMessage('up');
            else if (key === 'o') this.openAttachment();
            else if (key === 'p') this.jumpToParent(e);
        };

        // Handler for document keydown (Alt combinations, i, Esc)
        this.handleDocKeydown = (e) => {
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
                    const chat = document.querySelector(this.SELECTORS.chatContainer);
                    if (chat) this.channelSwitchStart.observe(chat, { childList: true, subtree: true });
                }
                return;
            }

            // Press i to return to the text box
            if (key === 'i' && !this.isInputActive() && !(e.ctrlKey && e.shiftKey)) {
                e.preventDefault();
                this.focusTextbox();
                return;
            }

            // If an image is currently open, use Ctrl+[ to go back to messages
            // Press Esc or Ctrl+[ to focus on the last message in the channel
            if (e.key === 'Escape' || (e.ctrlKey && e.key === '[')) {
                const backdrop = document.querySelector(this.SELECTORS.backdrop);
                if (backdrop) {
                    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', which: 27, bubbles: true }));
                } else {
                    this.focusLastMessage();
                }
            }
        };
    }

    start() {
        this.setupChannelSwitchObserver();

        document.querySelector(this.SELECTORS.appMount).addEventListener('keydown', this.handleAppKeydown);
        document.addEventListener('keydown', this.handleDocKeydown);

        // Optional focus ring styling (skinnier, rounder, milder color)
        this.styleElement = document.createElement('style');
        this.styleElement.textContent = `
            .focus-rings-ring {
                box-shadow: 0 0 0 3px #7ba6d1 !important;
                border-radius: 8px !important;
            }
        `;
        document.head.appendChild(this.styleElement);
    }

    stop() {
        document.querySelector(this.SELECTORS.appMount)?.removeEventListener('keydown', this.handleAppKeydown);
        document.removeEventListener('keydown', this.handleDocKeydown);

        this.channelSwitchStart?.disconnect();
        this.channelSwitchEnd?.disconnect();

        if (this.styleElement?.parentNode) {
            this.styleElement.parentNode.removeChild(this.styleElement);
        }
    }
}
