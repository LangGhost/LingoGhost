let isProcessing = false;

// Listen for messages from popup (e.g. settings changed)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateSettings") {
        // Re-run if settings changed? For now, we can just log it.
        console.log("Settings updated");
    }
});

// Auto-run on load if we have an API key
// Auto-run on load if we have an API key or Project ID (depending on mode)
chrome.storage.local.get(['geminiApiKey', 'apiMode', 'projectId', 'location', 'modelId', 'targetLang', 'density'], (result) => {
    const mode = result.apiMode || 'aistudio';
    const hasAuth = (mode === 'aistudio' && result.geminiApiKey) || (mode === 'vertex' && result.projectId);

    if (hasAuth && !isProcessing) {
        startTranslation({
            apiKey: result.geminiApiKey,
            apiMode: mode,
            projectId: result.projectId,
            location: result.location,
            // Default to Gemini 3 Flash
            modelId: result.modelId || 'gemini-3-flash-preview',
            targetLang: result.targetLang || 'Spanish',
            density: result.density || 20
        });
    }
});

function startTranslation(config) {
    isProcessing = true;
    console.log("LingoGhost: Starting translation with config:", config);

    // 1. Collect Text Nodes
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;

                const tag = parent.tagName.toLowerCase();
                if (['script', 'style', 'noscript', 'textarea', 'input', 'code', 'pre'].includes(tag)) {
                    return NodeFilter.FILTER_REJECT;
                }

                if (node.textContent.trim().length < 4) return NodeFilter.FILTER_REJECT; // Skip short noise
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes = [];
    let combinedText = "";

    while (walker.nextNode()) {
        // Grab a chunk of notes (simple logic: first 20 nodes or ~2000 chars)
        // For MVP, limit to avoid token limits.
        textNodes.push(walker.currentNode);
        combinedText += walker.currentNode.textContent + " ";
        if (combinedText.length > 4000) break; // Limit for MVP
    }

    if (combinedText.length === 0) {
        console.log("LingoGhost: No suitable text found.");
        return;
    }

    // 2. Request Translation
    chrome.runtime.sendMessage({
        action: "translate",
        text: combinedText,
        ...config
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("LingoGhost runtime error:", chrome.runtime.lastError);
            return;
        }

        if (response && response.success) {
            applyReplacements(textNodes, response.data.replacements);
        } else {
            console.error("LingoGhost error:", response ? response.error : "Unknown error");
        }
    });
}

function applyReplacements(nodes, replacements) {
    if (!replacements || replacements.length === 0) return;

    // Create a map for fast lookup
    // Note: This is case-sensitive for the MVP. Improving robustness is a future task.
    const replacementMap = new Map();
    replacements.forEach(item => {
        replacementMap.set(item.original, item.translated);
        // Add lowercase variant too if not present
        if (!replacementMap.has(item.original.toLowerCase())) {
            replacementMap.set(item.original.toLowerCase(), item.translated);
        }
    });

    let count = 0;

    nodes.forEach(node => {
        let text = node.textContent;
        let modified = false;

        // Split by spaces to find words (naive tokenization)
        // We use a regex to preserve punctuation attached to words
        const words = text.split(/(\s+)/);

        const newWords = words.map(word => {
            // Clean punctuation for lookup
            const cleanWord = word.replace(/^[^\w]+|[^\w]+$/g, '');
            const match = replacementMap.get(cleanWord);

            if (match) {
                count++;
                // Reconstruct word with punctuation
                // This is tricky: we just replace the core word.
                return word.replace(cleanWord, match);
            }
            return word;
        });

        if (count > 0) {
            // We can't insert HTML into a text node directly.
            // We have to replace the text node with a span if we want styling.
            // For MVP, let's just replace text content first.
            // node.textContent = newWords.join(''); 

            // BETTER: Replace with SPANs for styling
            const span = document.createElement('span');
            span.className = 'langswitch-text';

            words.forEach(word => {
                const cleanWord = word.replace(/^[^\w]+|[^\w]+$/g, '');
                const match = replacementMap.get(cleanWord);

                if (match) {
                    const translatedWord = word.replace(cleanWord, match);
                    const wordSpan = document.createElement('span');
                    wordSpan.className = 'langswitch-word';
                    wordSpan.textContent = translatedWord;
                    wordSpan.title = `${cleanWord} -> ${match}`; // Tooltip
                    span.appendChild(wordSpan);
                } else {
                    span.appendChild(document.createTextNode(word));
                }
            });

            if (node.parentNode) {
                node.parentNode.replaceChild(span, node);
            }
        }
    });

    console.log(`LingoGhost: Replaced ${count} words.`);
}
