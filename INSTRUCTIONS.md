# Setting up Google Cloud Vertex AI (Optional)

If you want to use the **Google Cloud Vertex AI** API (instead of Google AI Studio):

1. **Create a Google Cloud Project** at [console.cloud.google.com](https://console.cloud.google.com/).
2. **Enable APIs**:
   - Enable "Vertex AI API".
3. **Configure OAuth Consent Screen**:
   - Go to "APIs & Services" > "OAuth consent screen".
   - Select "External" (for testing) or "Internal".
   - Add your email as a test user.
4. **Create Credentials**:
   - Go to "APIs & Services" > "Credentials".
   - Create "OAuth client ID".
   - Application type: **Chrome Extension**.
   - Item ID: Copies unqique extension ID from `chrome://extensions`.
     - *Note: You must load the unpacked extension first to see its ID.*
5. **Update `manifest.json`**:
   - Copy the "Client ID" (ending in `.apps.googleusercontent.com`).
   - Paste it into `manifest.json` under `"oauth2": { "client_id": "PASTE_HERE" }`.
6. **Reload Extension**:
   - Go to `chrome://extensions` and click refresh.

Now you can select "Vertex AI (OAuth)" in the popup settings!
