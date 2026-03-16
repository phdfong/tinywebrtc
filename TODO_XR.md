# Project Enhancement Plan: XR & Spatial Computing

This document outlines the necessary steps to evolve the current 2D WebRTC video application into an immersive XR (Extended Reality) experience for devices like VR headsets (e.g., Meta Quest) and AR glasses.

The goal is to move from simple video streams to a shared 3D space where users feel present with each other as avatars.

---

## 1. [Critical] Adopt a 3D Rendering Engine

A 2D HTML/CSS interface is insufficient for XR. A real-time 3D engine is required to create and manage the shared virtual environment.

-   **[Task]** **Choose and Integrate a Web-based 3D Engine:**
    -   **Recommendation:** [Three.js](https://threejs.org/). It is the most popular and well-documented 3D library for the web, with a vast ecosystem.
    -   **Alternatives:** [Babylon.js](https://www.babylonjs.com/). Another powerful and feature-rich option.
    -   **Action:** Refactor the React frontend to render a Three.js canvas instead of the current 2D video grid.

---

## 2. [Major] Implement Avatars and Spatial Audio

User presence in XR is defined by avatars and spatialized audio, not video squares.

-   **[Task]** **Create or Integrate an Avatar System:**
    -   **Recommendation:** [Ready Player Me](https://readyplayer.me/). It provides a simple way for users to create a personal 3D avatar and offers an easy-to-use SDK.
    -   **Action:** Integrate the avatar SDK. When a user joins, load their avatar into the 3D scene.

-   **[Task]** **Synchronize Avatar Movement:**
    -   **Action:** Use the existing signaling server (or a dedicated state synchronization server) to broadcast avatar position and rotation data at a high frequency (e.g., 10-20 times per second).
    -   **Action:** On the receiving end, update the position and rotation of remote avatars in the Three.js scene to reflect their real-world movements.

-   **[Task]** **Implement Spatial Audio:**
    -   **Action:** Instead of playing remote audio directly, feed the `MediaStream` from each peer into a `PannerNode` (part of the Web Audio API).
    -   **Action:** Update the `PannerNode`'s position in 3D space to match the corresponding avatar's position. This will make audio sound like it's coming from the avatar's location, dramatically increasing immersion.

---

## 3. [Major] Adapt for WebXR

To run on XR devices, the application must use the WebXR Device API.

-   **[Task]** **Add WebXR Support to the 3D Scene:**
    -   **Action:** Use the built-in VR/AR button provided by Three.js or Babylon.js to enable XR mode.
    -   **Action:** In the render loop, use the headset's position and orientation data (provided by the WebXR API) to update the camera's perspective.

-   **[Task]** **Implement Controller/Hand Tracking:**
    -   **Action:** Use the WebXR API to get the position and orientation of the user's controllers or hands.
    -   **Action:** Render simple 3D models for the hands/controllers in the scene.
    -   **Action:** Broadcast hand/controller data to other peers so they can see your gestures.

---

## 4. [Medium] Rethink UI/UX for Spatial Computing

Standard HTML UI elements do not work well in a 3D environment.

-   **[Task]** **Create a Diegetic UI:**
    -   **Action:** Design UI elements (like mute buttons, user lists) as 3D objects that exist within the virtual world (e.g., a virtual control panel on the user's wrist).
    -   **Action:** Use raycasting from the user's controllers or gaze to interact with these 3D UI elements.

---
