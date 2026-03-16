# WebRTC Application Security Features

This document outlines the essential security features that need to be implemented to harden the WebRTC application against common threats.

## 1. Signaling Server Security

The signaling server is a publicly exposed endpoint and a primary target.

-   **[High] Implement Rate Limiting:**
    -   **Threat:** Denial-of-Service (DoS) attacks from a single IP flooding the server with `join_room` or other events.
    -   **Action:** Add a middleware to the Python server to limit the number of requests per IP address over a given time period (e.g., 100 requests per minute).

-   **[High] Input Validation and Sanitization:**
    -   **Threat:** Malicious payloads in `roomId` or `username` fields (e.g., attempting NoSQL/SQL injection, Cross-Site Scripting (XSS)).
    -   **Action:** Sanitize all incoming data. Ensure `roomId` and `username` conform to expected formats (e.g., alphanumeric, specific length) and escape any special characters.

-   **[Medium] Use Environment Variables for Configuration:**
    -   **Threat:** Hardcoding sensitive information like API keys or secrets in the source code.
    -   **Action:** Move configuration details (e.g., CORS origins, future API keys) into a `.env` file and load them at runtime. Do not commit the `.env` file to version control.

-   **[Medium] Restrict CORS Origins:**
    -   **Threat:** Allowing any website to connect to your signaling server.
    -   **Action:** Change `cors_allowed_origins='*'` in `server.py` to a specific list of allowed domains (e.g., your production frontend URL).

## 2. WebRTC & Media Security

WebRTC has strong built-in security, but it must be configured correctly.

-   **[High] Enforce Encrypted Media (SRTP):**
    -   **Threat:** Eavesdropping on video/audio streams.
    -   **Status:** **Mostly Complete.** WebRTC mandates SRTP (Secure Real-Time Transport Protocol) for all media streams. Modern browsers will not establish a connection without it. No direct action is needed, but it's crucial to be aware of this default protection.

-   **[High] Deploy Frontend over HTTPS:**
    -   **Threat:** `getUserMedia` (camera/mic access) is disabled by browsers on insecure (HTTP) origins, except for `localhost`. Man-in-the-middle attacks can intercept signaling.
    -   **Action:** When deploying to production, ensure the React application is served exclusively over HTTPS.

## 3. Application-Level Security

-   **[Medium] Implement Room Access Control:**
    -   **Threat:** Unauthorized users joining private rooms by guessing the `roomId`.
    -   **Action:** Implement an authentication layer. Before a user can join a room, they must be authenticated (e.g., via a login system). The signaling server should validate a token or session before allowing a user into a room.

-   **[Low] Obfuscate Room IDs:**
    -   **Threat:** Using simple, guessable room IDs (e.g., "test", "123").
    -   **Action:** Encourage or enforce the use of randomly generated, high-entropy strings (like UUIDs) for room IDs to make them harder to guess.

---
