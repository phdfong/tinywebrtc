# Project Enhancement Plan: Scaling to 100+ Users

This document outlines the necessary steps to evolve the current WebRTC demo from a simple mesh network into a scalable application capable of supporting 100 or more concurrent users in a room.

The current full-mesh architecture is not viable at scale. In a 100-user room, each client would need to manage 99 separate peer connections, requiring immense upload bandwidth and CPU power. The solution is to migrate to a **Selective Forwarding Unit (SFU)** architecture.

---

## 1. [Critical] Adopt an SFU (Selective Forwarding Unit)

An SFU is a media server that acts as a central router for media streams. Each client sends a single stream to the SFU, and the SFU forwards it to all other clients. This drastically reduces the client-side load.

-   **[Task]** **Choose and Deploy an SFU:**
    -   **Recommendation:** [LiveKit](https://livekit.io/). It is a powerful, open-source SFU with excellent documentation and client/server SDKs that handle most of the WebRTC complexity.
    -   **Alternatives:** [Mediasoup](https://mediasoup.org/), [Janus Gateway](https://janus.conf.meetecho.com/).
    -   **Action:** Deploy the chosen SFU to a cloud server with sufficient bandwidth (e.g., AWS EC2, DigitalOcean Droplet).

---

## 2. [Major] Refactor the Backend (`/backend`)

The existing signaling server will be replaced by a new backend service that authenticates users and manages room access for the SFU.

-   **[Task]** **Implement Token-Based Authentication:**
    -   The backend's new primary role is to generate access tokens.
    -   **Action:** Create a new Python endpoint (e.g., `/getToken`) that takes a `roomName` and `participantName`.
    -   **Action:** Use the SFU's server SDK (e.g., `livekit-server-sdk`) to generate a short-lived JWT access token with the appropriate grants (e.g., permission to join a specific room).

---

## 3. [Major] Refactor the Frontend (`/webapp`)

The client-side WebRTC logic must be rewritten to communicate with the SFU instead of manually managing peer connections.

-   **[Task]** **Integrate the SFU Client SDK:**
    -   **Action:** Remove the existing `RTCPeerConnection` management logic (`createPeerConnection`, `createOffer`, `createAnswer`).
    -   **Action:** Add the SFU's client SDK (e.g., `livekit-client`) as a dependency.
    -   **Action:** Update the `joinRoom` flow:
        1.  First, fetch an access token from your new backend service.
        2.  Use the token and the SFU's URL to connect using the client SDK.
        3.  The SDK will handle all underlying WebRTC and signaling complexity.

-   **[Task]** **Handle Tracks and Participants via SDK Events:**
    -   **Action:** Refactor the UI to be driven by events from the SFU's SDK.
    -   Listen for events like `participantConnected`, `trackSubscribed`, and `participantDisconnected`.
    -   When a `trackSubscribed` event occurs, get the `MediaStream` from the event and attach it to a video element.
    -   Update the `remotePeers` state based on these events.

---

## 4. [Medium] UI/UX Enhancements for Large Rooms

Displaying 100 videos simultaneously is not feasible. The UI needs to adapt to a large number of participants.

-   **[Task]** **Implement Active Speaker Detection:**
    -   Most SFU SDKs provide events indicating who is currently speaking.
    -   **Action:** Use these events to highlight the video frame of the active speaker.

-   **[Task]** **Create a Dynamic Video Layout:**
    -   **Action:** Design a "main stage" area for the active speaker or pinned users.
    -   **Action:** Display other participants in a smaller, scrollable sidebar or filmstrip.
    -   **Action:** Leverage SFU features like **Simulcast**. Subscribe to lower-quality video tracks for participants who are not on the main stage to conserve bandwidth.

---
