// ==UserScript==
// @name         Discord Vim Navigation
// @version      2.5
// @description  Vim-like Discord navigation, using j/k as up/down.
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

    document.querySelector('#app-mount').addEventListener('keydown', (e) => {
        let key = e.key.toLowerCase();

        // Allow quick switcher
        if (e.ctrlKey && key == 'k') return;

        // Prevent Discord from changing focus to textbox
        if (!e.altKey && (key == 'j' || key == 'k' || key == 'o' || key == 'p')) {
            e.stopImmediatePropagation();
        }

        if (document.activeElement.isContentEditable || document.activeElement.nodeName == 'INPUT' || document.activeElement.nodeName == 'TEXTAREA') return;

        // Navigate between messages
        if (key == 'j' || key == 'k') {

            let selectedMsg = document.querySelector('[class*="message"][class*="selected"]');

            // Prevent this movement from going down to the textbox
            if (key == 'j' && selectedMsg == [...document.querySelectorAll('[data-list-item-id^="chat-messages"]')].pop()) return;

            let evt = new KeyboardEvent('keydown', {
                key: (key == 'j' ? 'ArrowDown' : 'ArrowUp'),
                bubbles: true,
            });

            if (selectedMsg) {
                selectedMsg.dispatchEvent(evt);
            } else {
                document.querySelector('#app-mount').dispatchEvent(evt);
            }

        }
        // Press o to open a link or image
        else if (key == 'o') {
            let link = document.querySelector('div[class*="selected_"] a[class*="anchor"]');
            if (link && !link.parentElement.matches('[class*="repliedTextContent_"]')) link.click();
            else {
              let img = document.querySelector('div[class*="selected_"] [class^="clickableWrapper_"]');
              if (img) img.click();
            }
        }
        // Press p to go to a reply's parent
        else if (key == 'p') {
            let selectedMessage = document.querySelector('div[class*="selected_"][class*="hasReply_"]');
            if (selectedMessage) {
                e.preventDefault();
                let replyBtn = selectedMessage.querySelector('div[class*="repliedTextPreview_"]');
                let replyId = replyBtn.children[0].id.split('-').at(-1);
                replyBtn.click();
                let reply = document.querySelector('#chat-messages_' + replyId);
                reply.children[0].focus();
                document.querySelector('#app-mount').dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'ArrowUp',
                    bubbles: true,
                }));
            }
        }

    });

    document.addEventListener('keydown', (e) => {

        let key = e.key.toLowerCase();

        if (e.altKey) {
            // Navigate forward and backward in history
            if (key == 'h') history.back();
            else if (key == 'l') history.forward();
            else if (key == 'j' || key == 'k') {
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: (key == 'j' ? 'ArrowDown' : 'ArrowUp'),
                    keyCode: (key == 'j' ? 40 : 38),
                    which: (key == 'j' ? 40 : 38),
                    bubbles: true,
                    shiftKey: e.shiftKey,
                    ctrlKey: e.ctrlKey,
                    altKey: e.altKey,
                }));

                if (document.querySelector('div[class*="chat_"]')) {
                    channelSwitchStart.observe(document.querySelector('div[class*="chat_"]'), {
                        childList: true,
                        subtree: true,
                    });
                }

            }
        }

        // Press i to return to the text box
        else if (key == 'i' && !document.activeElement.isContentEditable && document.activeElement.nodeName != 'INPUT' && document.activeElement.nodeName != 'TEXTAREA' && !(e.ctrlKey && e.shiftKey)) {
            e.preventDefault();
            let el = document.querySelector('div[role="textbox"]');
            el.focus();

            // Place cursor at end of textbox
            if (el.textContent.length > 0 && el.textContent != '\ufeff') {
                setTimeout(() => {
                    window.getSelection().collapse(el, 1);
                }, 25);
            }

        }

        // If an image is currently open, use Ctrl+[ to go back to messages
        else if (e.ctrlKey && e.key == '[' && document.querySelector('[class^="backdrop-"]')) {
            let imageView = document.querySelector('[class^="backdrop-"]')
            if (imageView) {
                imageView.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape',
                    which: 27,
                    bubbles: true,
                }))
                console.log("escaped");
            }
        }

        // Press Esc or Ctrl+[ to focus on the last message in the channel
        else if (e.key == 'Escape' || e.ctrlKey && e.key == '[') {

            let jumpBtn = document.querySelector('[class^="barButtonMain"]');

            if (jumpBtn) {
              jumpBtn.click();
            } else {
              document.querySelector('[class^="scrollerInner"] > *:nth-last-child(2)').scrollIntoView();
            }

            let bar = document.querySelector('[class*="editor_"]');

            bar.focus();
            bar.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Tab',
                bubbles: true,
            }));

            setTimeout(() => {
                bar.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'ArrowUp',
                    bubbles: true,
                    keyCode: 38,
                }));
            }, 5);

        }

    });

    // Automatically focus on the last message in the channel after switching channels
    const channelSwitchStart = new MutationObserver((mutations, observer) => {

        if ([...mutations[0].removedNodes].filter((n) => n.matches('[data-list-id="chat-messages"] li'))) {

            setTimeout(() => {

                channelSwitchEnd.observe(document.querySelector('div[class*="chat_"]'), {
                    childList: true,
                    subtree: true,
                });

            }, 25);

            observer.disconnect();

        }

    });

    const channelSwitchEnd = new MutationObserver((mutations, observer) => {

        if (document.querySelector('[data-list-id="chat-messages"] li')) {

            setTimeout(() => {

                let bar = document.querySelector('[class*="editor_"]');

                let lastMsg = document.querySelector('[class*="scrollerInner"] > *:nth-last-child(2)'); //document.querySelector('[id^="chat-messages-"]:last-of-type');

                lastMsg.scrollIntoView();

                bar.focus();
                bar.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Tab',
                    bubbles: true,
                }));

                setTimeout(() => {
                    bar.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'ArrowUp',
                        bubbles: true,
                        keyCode: 38,
                    }));
                }, 5);

            }, 25);
            observer.disconnect();

        }

    });

    // Optional focus ring styling (skinnier, rounder, milder color)
    let css = document.createElement('style');
    css.innerHTML = `
      .focus-rings-ring {
        box-shadow: 0 0 0 3px #7ba6d1 !important;
        border-radius: 8px !important;
      }
    `;
    document.head.appendChild(css);


})();
