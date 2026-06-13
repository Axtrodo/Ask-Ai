// @license      MIT
// ==UserScript==
// @name         Ask AI
// @namespace    http://tampermonkey.net/
// @version      1.0.4
// @description  Search selected text across AI tools (No popup warnings, no double-tabs)
// @match        *://*/*
// @run-at       document-end
// @grant        GM_setClipboard
// ==/UserScript==
 
(function () {
    "use strict";
 
    const buttonId = "ask-ai-button";
    const menuId = "ask-ai-menu";
    const promptId = "ask-ai-prompt";
 
    let mouseX = 0, mouseY = 0;
    let scrollBaseY = 0;
    let selectionTimeout = null;
    let activeSelectionText = "";
    let menuFiring = false;
 
    const AIs = [
        { name: "Perplexity",   url: t => `https://www.perplexity.ai/search?q=${t}` },
        { name: "Google Search", url: t => `https://www.google.com/search?q=${t}&udm=50` },
        { name: "DeepSeek",     url: () => `https://chat.deepseek.com/`, copy: true },
        { name: "Claude",       url: t => `https://claude.ai/new?q=${t}` },
        { name: "Grok",         url: t => `https://grok.com/?q=${t}` },
        { name: "ChatGPT",      url: t => `https://chatgpt.com/?q=${t}` },
        { name: "Gemini",       url: () => `https://gemini.google.com/app`, copy: true },
    ];
 
    const PRESETS = [
        "Explain", "Elaborate", "ELI5", "Synonyms",
        "Summarize", "Examples", "Translate", "Define",
        "Etymology", "Pros & Cons", "Counterarguments", "Fix grammar",
        "Rewrite formally", "Rewrite casually", "Shorter", "Longer",
        "Fact-check", "Historical context", "Real-world examples", "Compare & contrast",
        "Key takeaways", "Quiz me on this",
    ];
 
    function trackMouse(e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }
 
    function handleKeyDown(e) {
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
 
        if (e.altKey && e.key.toLowerCase() === "q") {
            e.preventDefault();
            const text = getSelectionText();
            if (!text) return;
            const existing = document.getElementById(menuId);
            if (existing) { removeMenu(); return; }
            const bounds = getSelectionBounds();
            const px = bounds ? bounds.x + 6 : mouseX + 12;
            const py = bounds ? bounds.y - 6 : mouseY + 12;
            showMenu(px, py, text);
            return;
        }
 
        const digitMatch = e.code && e.code.match(/^Digit([1-7])$/);
        if (digitMatch && (e.shiftKey || document.getElementById(menuId))) {
            const index = parseInt(digitMatch[1], 10) - 1;
            const ai = AIs[index];
            const text = getSelectionText() || activeSelectionText;
            if (!ai || !text) return;
 
            if (e.shiftKey) {
                e.preventDefault();
                const bounds = getSelectionBounds();
                const px = bounds ? bounds.x + 6 : mouseX + 12;
                const py = bounds ? bounds.y - 6 : mouseY + 12;
                showPrompt(ai, text, px, py);
            } else if (document.getElementById(menuId)) {
                openAI(ai, text);
                removeMenu();
                hideButton();
            }
        }
    }
 
    function handleClick() {
        removeMenu();
        removePrompt();
        activeSelectionText = "";
        setTimeout(createButton, 0);
    }
 
    function handleScroll() {
        if (Math.abs(window.scrollY - scrollBaseY) > 50) {
            removeMenu();
            removePrompt();
            hideButton();
        }
    }
 
    function handleSelectionChange() {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(createButton, 120);
    }
 
    function cleanup() {
        document.removeEventListener("mousemove", trackMouse);
        document.removeEventListener("keydown", handleKeyDown);
        document.removeEventListener("click", handleClick);
        window.removeEventListener("scroll", handleScroll);
        document.removeEventListener("selectionchange", handleSelectionChange);
        window.removeEventListener("load", createButton);
        clearTimeout(selectionTimeout);
        removeMenu();
        removePrompt();
        hideButton();
    }
 
    function getSelectionText() {
        const sel = document.getSelection();
        if (!sel) return null;
        const text = sel.toString().trim();
        return (!text || text.length > 1000) ? null : text;
    }
 
    function getSelectionBounds() {
        const sel = document.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        try {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            return (rect.width > 0 || rect.height > 0) ? { x: rect.right, y: rect.top } : null;
        } catch (_) {
            return null;
        }
    }
 
    function removeMenu() {
        const m = document.getElementById(menuId);
        if (m) m.remove();
        activeSelectionText = "";
    }
 
    function removePrompt() {
        const p = document.getElementById(promptId);
        if (p) p.remove();
        activeSelectionText = "";
    }
 
    function hideButton() {
        const btn = document.getElementById(buttonId);
        if (btn) btn.style.display = "none";
    }
 
    function clampToViewport(el, preferredX, preferredY) {
        requestAnimationFrame(() => {
            if (!el.parentNode) return;
            const pad = 8;
            const rect = el.getBoundingClientRect();
            let x = Math.max(pad, Math.min(preferredX, window.innerWidth - rect.width - pad));
            let y = Math.max(pad, Math.min(preferredY, window.innerHeight - rect.height - pad));
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
        });
    }
 
    function blockMiddleClick(el) {
        ["mousedown", "mouseup", "click", "auxclick"].forEach(type => {
            el.addEventListener(type, (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        });
    }
 
    async function copyText(text) {
        if (typeof GM_setClipboard === "function") {
            try {
                GM_setClipboard(text, "text");
                return true;
            } catch (_) {}
        }
 
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (_) {}
        }
 
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
            document.body.appendChild(ta);
            ta.select();
            const success = document.execCommand("copy");
            document.body.removeChild(ta);
            return success;
        } catch (_) {
            return false;
        }
    }
 
    // --- SIMPLE openAI: Only opens in new tab, no fallbacks, no alerts ---
    function openAI(ai, text) {
        if (!text) return;
        if (ai.copy) {
            copyText(text).catch(() => {}); // Silently try to copy (no alerts)
        }
        const url = ai.copy ? ai.url() : ai.url(encodeURIComponent(text));
        window.open(url, "_blank", "noopener,noreferrer");
    }
 
    function showPrompt(ai, text, anchorX, anchorY) {
        removePrompt();
        scrollBaseY = window.scrollY;
        activeSelectionText = text;
 
        let includeContext = false;
        let firing = false;
 
        const box = document.createElement("div");
        box.id = promptId;
        box.tabIndex = -1;
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-label", "Customize AI prompt");
        Object.assign(box.style, {
            position: "fixed",
            zIndex: "9999",
            left: `${anchorX}px`,
            top: `${anchorY}px`,
            backgroundColor: "#111",
            border: "1px solid #333",
            borderRadius: "10px",
            padding: "10px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            fontFamily: "system-ui, sans-serif",
            fontSize: "11px",
            width: "260px",
            userSelect: "none",
        });
 
        box.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.target !== input && !e.target.closest("button, input")) box.focus();
        });
        blockMiddleClick(box);
 
        const contextToggle = document.createElement("div");
        contextToggle.textContent = "🌐 Context: OFF (press C)";
        contextToggle.setAttribute("role", "button");
        contextToggle.setAttribute("aria-label", "Toggle page context");
        Object.assign(contextToggle.style, {
            fontSize: "10px", color: "#888", marginBottom: "6px",
            cursor: "pointer", textAlign: "center", padding: "3px",
            borderRadius: "4px", transition: "color 0.15s",
        });
 
        const refreshContextLabel = () => {
            contextToggle.textContent = includeContext ? "🌐 Context: ON (press C)" : "🌐 Context: OFF (press C)";
            contextToggle.style.color = includeContext ? "#4fc" : "#888";
        };
 
        contextToggle.addEventListener("mouseenter", () => contextToggle.style.color = "#ccc");
        contextToggle.addEventListener("mouseleave", refreshContextLabel);
        contextToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            includeContext = !includeContext;
            refreshContextLabel();
        });
        box.appendChild(contextToggle);
 
        const grid = document.createElement("div");
        Object.assign(grid.style, {
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginBottom: "8px"
        });
        PRESETS.forEach(preset => {
            const btn = document.createElement("button");
            btn.textContent = preset;
            btn.setAttribute("aria-label", `Use preset: ${preset}`);
            Object.assign(btn.style, {
                padding: "4px 6px", borderRadius: "5px", border: "1px solid #333",
                backgroundColor: "#1a1a1a", color: "#ccc", cursor: "pointer",
                fontSize: "11px", textAlign: "left", transition: "background 0.1s"
            });
            btn.addEventListener("mouseenter", () => btn.style.backgroundColor = "#2a2a2a");
            btn.addEventListener("mouseleave", () => btn.style.backgroundColor = "#1a1a1a");
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                input.value = preset + ": ";
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            });
            grid.appendChild(btn);
        });
 
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Custom prefix...";
        input.setAttribute("aria-label", "Prompt prefix");
        Object.assign(input.style, {
            width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #333",
            backgroundColor: "#1a1a1a", color: "#eee", fontSize: "12px", outline: "none",
            boxSizing: "border-box", marginBottom: "8px"
        });
        blockMiddleClick(input);
 
        const send = document.createElement("button");
        send.textContent = "Send";
        send.setAttribute("aria-label", "Send to AI");
        Object.assign(send.style, {
            width: "100%", padding: "6px", borderRadius: "6px", border: "none",
            backgroundColor: "#222", color: "#eee", cursor: "pointer", fontSize: "12px"
        });
 
        function fire() {
            if (firing) return;
            firing = true;
            const prefix = input.value.trim();
            let query = prefix ? `${prefix}: ${text}` : text;
            if (includeContext) {
                query += `\n\n---\nSource: "${document.title}"\n${location.href}`;
            }
            openAI(ai, query);
            removePrompt();
            removeMenu();
            hideButton();
            setTimeout(() => { firing = false; }, 500);
        }
 
        send.addEventListener("click", (e) => { e.stopPropagation(); fire(); });
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); fire(); }
            else if (e.key === "Escape") { e.preventDefault(); removePrompt(); }
            e.stopPropagation();
        });
 
        box.addEventListener("keydown", (e) => {
            if (e.key === "c" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && document.activeElement !== input) {
                e.preventDefault();
                e.stopPropagation();
                includeContext = !includeContext;
                refreshContextLabel();
            }
        }, true);
 
        box.append(grid, input, send);
        document.body.appendChild(box);
        clampToViewport(box, anchorX, anchorY);
        input.focus();
    }
 
    function showMenu(anchorX, anchorY, text) {
        removeMenu();
        scrollBaseY = window.scrollY;
        activeSelectionText = text || getSelectionText();
        if (!activeSelectionText) return;
 
        const menu = document.createElement("div");
        menu.id = menuId;
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", "Select AI tool");
        Object.assign(menu.style, {
            position: "fixed", zIndex: "9999", left: `${anchorX}px`, top: `${anchorY}px`,
            backgroundColor: "#111", border: "1px solid #333", borderRadius: "8px",
            padding: "4px", boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            fontFamily: "system-ui, sans-serif", fontSize: "12px", minWidth: "150px", userSelect: "none"
        });
 
        menu.addEventListener("click", (e) => e.stopPropagation());
        blockMiddleClick(menu);
 
        AIs.forEach((ai, i) => {
            const item = document.createElement("div");
            item.textContent = `${i + 1}. ${ai.name}${ai.copy ? " 📋" : ""}`;
            item.setAttribute("role", "menuitem");
            item.setAttribute("tabindex", "0");
            item.setAttribute("aria-label", `Open ${ai.name}`);
            Object.assign(item.style, {
                padding: "5px 10px", borderRadius: "5px", color: "#eee",
                cursor: "pointer", transition: "background 0.1s", whiteSpace: "nowrap"
            });
            item.addEventListener("mouseenter", () => item.style.backgroundColor = "#222");
            item.addEventListener("mouseleave", () => item.style.backgroundColor = "transparent");
 
            item.addEventListener("click", (e) => {
                e.stopPropagation();
                if (menuFiring) return;
                menuFiring = true;
                const currentText = getSelectionText() || activeSelectionText;
                if (currentText) openAI(ai, currentText);
                removeMenu();
                hideButton();
                setTimeout(() => { menuFiring = false; }, 500);
            });
 
            item.addEventListener("auxclick", (e) => {
                if (e.button !== 1) return;
                e.preventDefault();
                e.stopPropagation();
                const r = item.getBoundingClientRect();
                showPrompt(ai, activeSelectionText, r.right + 6, r.top);
            });
 
            menu.appendChild(item);
        });
 
        document.body.appendChild(menu);
        clampToViewport(menu, anchorX, anchorY);
    }
 
    function createButton() {
        let btn = document.getElementById(buttonId);
        if (!btn) {
            btn = document.createElement("button");
            btn.id = buttonId;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
            btn.title = "Ask AI (Alt+Q, Shift+1-7 for prompt)";
            btn.setAttribute("aria-label", "Ask AI");
            Object.assign(btn.style, {
                position: "fixed", zIndex: "9999", width: "32px", height: "32px",
                border: "none", borderRadius: "50%", backgroundColor: "#111",
                cursor: "pointer", outline: "none", display: "none",
                alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.5)", transition: "background 0.15s"
            });
            btn.addEventListener("mouseenter", () => btn.style.backgroundColor = "#333");
            btn.addEventListener("mouseleave", () => btn.style.backgroundColor = "#111");
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (document.getElementById(menuId)) { removeMenu(); return; }
                const r = btn.getBoundingClientRect();
                showMenu(r.right + 6, r.top);
            });
            blockMiddleClick(btn);
            document.body.appendChild(btn);
        }
 
        const text = getSelectionText();
        if (text) {
            const bounds = getSelectionBounds();
            const posX = bounds ? bounds.x + 6 : mouseX + 12;
            const posY = bounds ? bounds.y - 6 : mouseY + 12;
            btn.style.left = `${Math.max(8, Math.min(posX, window.innerWidth - 40))}px`;
            btn.style.top = `${Math.max(8, Math.min(posY, window.innerHeight - 40))}px`;
            btn.style.display = "flex";
        } else {
            btn.style.display = "none";
            removeMenu();
        }
    }
 
    document.addEventListener("mousemove", trackMouse);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClick);
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("load", createButton);
    window.addEventListener("beforeunload", cleanup);
})();
