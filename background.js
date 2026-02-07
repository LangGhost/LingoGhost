chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "translate") {
        console.log("LingoGhost Background: Received translate request", request);
        handleTranslation(request.text, request.targetLang, request.density, request)
            .then(response => {
                console.log("LingoGhost Background: Success", response);
                sendResponse({ success: true, data: response });
            })
            .catch(error => {
                console.error("LingoGhost Background: Failure", error);
                sendResponse({ success: false, error: error.message || error.toString() });
            });
        return true; // Keep message channel open for async response
    }
});

async function handleTranslation(text, targetLang, density, config) {
    const { apiMode, apiKey, projectId, location, modelId } = config;
    let apiUrl = '';
    let token = '';

    console.log(`LingoGhost Background: Processing with Mode=${apiMode}, Model=${modelId}`);

    // Choose API Mode
    if (apiMode === 'vertex') {
        if (!projectId || !location) {
            throw new Error("Missing Project ID or Location for Vertex AI.");
        }

        // Get OAuth Token
        try {
            token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: true }, (authToken) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(authToken);
                    }
                });
            });
            console.log("LingoGhost Background: OAuth Token acquired");
        } catch (e) {
            console.error("Auth Error:", e);
            throw new Error("OAuth2 Error. Ensure `oauth2` client_id in manifest.json is correct. " + e.message);
        }

        const model = modelId || 'gemini-3-flash-preview';
        apiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

    } else {
        // Default: AI Studio
        const model = modelId || 'gemini-3-flash-preview';
        if (!apiKey) throw new Error("Missing API Key for Google AI Studio.");
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    }

    // limit text length
    const truncatedText = text.substring(0, 5000);

    const prompt = `
    You are a language learning assistant.
    Goal: Select approximately ${density}% of the words (nouns, adjectives, verbs) in the following text and translate them into ${targetLang}.
    
    Rules:
    1. Select simple, common words suitable for learning.
    2. Provide the translation that fits the CONTEXT.
    3. Do NOT translate proper names or specialized technical terms.
    4. Output MUST be valid JSON.
    5. Format: { "replacements": [ { "original": "word", "translated": "traducción" }, ... ] }
    6. Return ONLY the JSON object, no markdown formatting.
    
    Text to process:
    "${truncatedText}"
  `;

    const requestBody = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    const headers = { "Content-Type": "application/json" };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    console.log(`LingoGhost Background: Fetching from ${apiUrl}`);

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
            console.error("LingoGhost API Error Data:", errorData);
            throw new Error(`API Error (${response.status}): ${errorData.error?.message || JSON.stringify(errorData)}`);
        }

        const data = await response.json();

        const candidate = data.candidates && data.candidates[0];
        if (!candidate || !candidate.content || !candidate.content.parts) {
            console.error("Invalid response structure:", data);
            throw new Error("Invalid response structure from Gemini API");
        }

        let jsonString = candidate.content.parts[0].text;
        // Clean markdown
        jsonString = jsonString.replace(/```json\n?|\n?```/g, '').trim();

        const result = JSON.parse(jsonString);
        return result;

    } catch (error) {
        console.error("LingoGhost Logic Error:", error);
        throw error;
    }
}
