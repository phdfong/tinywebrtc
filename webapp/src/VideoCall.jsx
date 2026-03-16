import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

// 1. Configuration for the PeerConnection
// STUN servers allow the browser to discover its own public IP address.
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// Initialize socket connection outside component to prevent multiple connections on render
const socket = io('http://localhost:3000', {
  autoConnect: false,
});

const VideoCall = () => {
  const [isJoined, setIsJoined] = useState(false);
  const [roomId, setRoomId] = useState('room1');
  const [username, setUsername] = useState('user' + Math.floor(Math.random() * 1000));
  const [remotePeers, setRemotePeers] = useState({}); // { [peerId]: { stream: MediaStream, username: string } }
  const [logs, setLogs] = useState([]);
  
  // 2. Refs are used for mutable objects that don't trigger re-renders
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  
  const peersRef = useRef({}); // { [peerId]: RTCPeerConnection }
  const iceCandidatesQueue = useRef({}); // { [peerId]: RTCIceCandidate[] }
  
  // Keep track of state in refs to avoid stale closures in socket listeners
  const roomIdRef = useRef(roomId);
  const usernameRef = useRef(username);

  useEffect(() => {
    roomIdRef.current = roomId;
    usernameRef.current = username;
  }, [roomId, username]);

  const addLog = (message) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${message}`, ...prev]);
    console.log(`[${time}] ${message}`);
  };

  const processIceQueue = async (peerId) => {
    addLog(`Function Call: processIceQueue(${peerId})`);
    const pc = peersRef.current[peerId];
    const queue = iceCandidatesQueue.current[peerId];
    
    if (pc && queue) {
      while (queue.length > 0) {
        const candidate = queue.shift();
        try {
          addLog(`WebRTC [${peerId}]: Adding queued ICE candidate: ${candidate.candidate}`);
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding queued ice candidate', e);
        }
      }
    }
  };

  useEffect(() => {
    // Socket Event Listeners
    addLog('Function Call: useEffect[] (mount)');
    socket.on('connect', () => {
      addLog('Signaling: Connected to server');
    });
    socket.on('disconnect', () => {
      addLog('Signaling: Disconnected from server');
    });

    // A new peer joined the room: We (the existing user) become the Caller
    socket.on('peer_joined', async ({ peerId, username: peerName }) => {
      if (peerId === socket.id) return; // ignore self
      addLog(`Signaling: Peer "${peerName}" joined (${peerId}). Creating Offer...`);
      const pc = createPeerConnection(peerId, peerName);
      await createOffer(pc, peerId);
    });

    // We received an Offer: We become the Callee
    socket.on('offer', async ({ sdp, caller, username: callerName }) => {
      if (caller === socket.id) return;
      
      // If we already have a connection for this caller, it might be a renegotiation or a broadcast echo.
      // For this simple demo, we assume broadcast echo or duplicate and ignore if exists.
      if (peersRef.current[caller]) {
        addLog(`Signaling: Ignored Offer from "${callerName}" (${caller}) - Connection exists.`);
        return;
      }

      addLog(`Signaling: Received Offer from "${callerName}" (${caller}). Creating Answer...`);
      addLog(`SDP DETAILS (Offer): ${sdp.sdp.substring(0, 60)}...`);
      
      const pc = createPeerConnection(caller, callerName);
      await createAnswer(pc, sdp, caller);
    });

    // We received an Answer to our Offer
    socket.on('answer', async ({ sdp, responder, username: responderName }) => {
      if (responder === socket.id) return;
      const pc = peersRef.current[responder];
      addLog(`Signaling: Received Answer from "${responderName}" (${responder}). Setting Remote Description.`);
      addLog(`SDP DETAILS (Answer): ${sdp.sdp.substring(0, 60)}...`);
      if (pc) {
        // Set the remote description (the answer)
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        processIceQueue(responder);
      }
    });

    // We received an ICE candidate (network path info)
    socket.on('ice_candidate', async ({ candidate, from }) => {
      if (from === socket.id) return;
      const pc = peersRef.current[from];
      addLog(`Signaling: Received ICE Candidate from ${from}`);
      if (pc && candidate) {
        if (pc.remoteDescription) {
          try {
            addLog(`WebRTC [${from}]: Adding ICE Candidate`);
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('Error adding received ice candidate', e);
          }
        } else {
          addLog(`WebRTC [${from}]: Remote description not set. Queueing ICE Candidate.`);
          if (!iceCandidatesQueue.current[from]) iceCandidatesQueue.current[from] = [];
          iceCandidatesQueue.current[from].push(candidate);
        }
      }
    });

    return () => {
      // Cleanup listeners on unmount
      addLog('Function Call: useEffect[] (unmount cleanup)');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('peer_joined');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice_candidate');
    };
  }, []);

  useEffect(() => {
    addLog('Function Call: useEffect[isJoined]');
    if (isJoined && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isJoined]);

  // 3. Initialize Media and Join Room
  const joinRoom = async () => {
    addLog(`Function Call: joinRoom() - User Action: ${username || 'Anonymous'} joining room "${roomId}"`);
    if (!roomId) {
      alert('Please enter a Room ID');
      return;
    }
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support getUserMedia. Are you running on HTTP instead of HTTPS/localhost?');
      }
      addLog('System: Requesting Camera/Mic access...');
      // Get User Media (Camera/Mic)
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      addLog('System: Media stream obtained.');
      
      // Show local video immediately
      localStreamRef.current = stream;

      // Connect to Socket and Join
      addLog('Signaling: Connecting to socket...');
      socket.connect();
      socket.emit('join_room', { roomId, username: username || 'Anonymous' });
      setIsJoined(true);
      
      // We do NOT initialize a single PeerConnection here anymore.
      // Connections are created on-demand when peers join or offer.

    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert(`Could not access camera/microphone. \n\nError: ${error.name}\nMessage: ${error.message}`);
    }
  };

  // 4. Create PeerConnection Logic (Per Peer)
  const createPeerConnection = (peerId, peerUsername) => {
    addLog(`Function Call: createPeerConnection(${peerId})`);
    
    // If a connection already exists, clean it up (rare in this simple flow)
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close();
    }

    const pc = new RTCPeerConnection(rtcConfig);

    // Add local tracks (audio/video) to the connection
    localStreamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    // Event: Local ICE candidate created -> Send to remote peer via Signaling Server
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // addLog(`ICE DETAILS: ${event.candidate.candidate}`); // too verbose for 3 users
        socket.emit('ice_candidate', { 
          roomId: roomIdRef.current, 
          candidate: event.candidate 
        });
      }
    };

    // Event: Remote stream received -> Attach to video element
    pc.ontrack = (event) => {
      addLog(`WebRTC [${peerId}]: Received Remote Stream track.`);
      setRemotePeers(prev => ({
        ...prev,
        [peerId]: {
          username: peerUsername || 'Unknown',
          stream: event.streams[0]
        }
      }));
    };

    peersRef.current[peerId] = pc;
    return pc;
  };

  // 5. Caller Logic: Create Offer
  const createOffer = async (pc, targetPeerId) => {
    if (!pc) return;
    
    try {
      addLog(`Function Call: createOffer() for ${targetPeerId}`);
      const offer = await pc.createOffer();
      addLog(`SDP DETAILS (Local Offer): ${offer.sdp.substring(0, 60)}...`);
      await pc.setLocalDescription(offer);
      
      // Send offer to signaling server
      addLog(`Signaling: Sending Offer to server (target implied via broadcast)...`);
      // Note: Backend broadcast means everyone receives this. Receivers must filter by existing connection.
      socket.emit('offer', { 
        roomId: roomIdRef.current, 
        sdp: offer,
        username: usernameRef.current || 'Anonymous',
        target: targetPeerId
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  // 6. Callee Logic: Create Answer
  const createAnswer = async (pc, sdp, callerId) => {
    if (!pc) return;

    addLog(`Function Call: createAnswer() for ${callerId}`);
    try {
      addLog(`WebRTC [${callerId}]: Setting Remote Description from Offer...`);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      processIceQueue(callerId);
      
      addLog(`WebRTC [${callerId}]: Creating Answer (SDP)...`);
      const answer = await pc.createAnswer();
      addLog(`SDP DETAILS (Local Answer): ${answer.sdp.substring(0, 60)}...`);
      await pc.setLocalDescription(answer);

      addLog(`Signaling: Sending Answer to server...`);
      socket.emit('answer', { 
        roomId: roomIdRef.current, 
        sdp: answer,
        username: usernameRef.current || 'Anonymous',
        target: callerId
      });
    } catch (error) {
      console.error('Error creating answer:', error);
    }
  };

  return (
    <div style={styles.container}>
      <h1>WebRTC Demo</h1>
      
      {!isJoined ? (
        <div style={styles.joinScreen}>
          <input 
            type="text" 
            placeholder="Enter User Name" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
          />
          <input 
            type="text" 
            placeholder="Enter Room ID" 
            value={roomId} 
            onChange={(e) => setRoomId(e.target.value)}
            style={styles.input}
          />
          <button onClick={joinRoom} style={styles.button}>Join Room</button>
          <p style={styles.instruction}>
            Open this page in a second tab and join the same room to connect.
          </p>
        </div>
      ) : (
        <>
          <div style={styles.userInfo}>
            <p>Connected as <strong>{username}</strong> in Room <strong>{roomId}</strong></p>
          </div>
          <div style={styles.videoGrid}>
            <div style={styles.videoWrapper}>
              <h3>Local</h3>
              <video ref={localVideoRef} autoPlay playsInline muted style={{ ...styles.video, transform: 'scaleX(-1)' }} />
            </div>
            {Object.entries(remotePeers).map(([id, peer]) => (
              <RemoteVideo key={id} stream={peer.stream} username={peer.username} />
            ))}
            {Object.keys(remotePeers).length === 0 && (
              <div style={styles.videoWrapper}>
                <h3>Remote</h3>
                <div style={styles.placeholder}>
                   Waiting for others...
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div style={styles.logContainer}>
        <h3>Connection Logs</h3>
        {logs.map((log, index) => (
          <div key={index} style={styles.logEntry}>{log}</div>
        ))}
      </div>
    </div>
  );
};

// Helper Component for Remote Video
const RemoteVideo = ({ stream, username }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div style={styles.videoWrapper}>
      <h3>{username}</h3>
      <video ref={videoRef} autoPlay playsInline style={styles.video} />
    </div>
  );
};

// Basic Inline Styles
const styles = {
  container: { padding: '20px', fontFamily: 'Arial, sans-serif', textAlign: 'center' },
  userInfo: { marginBottom: '15px', fontSize: '1.2em' },
  joinScreen: { marginTop: '50px' },
  input: { padding: '10px', fontSize: '16px', marginRight: '10px' },
  button: { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '5px' },
  instruction: { marginTop: '20px', fontSize: '14px', color: '#666' },
  videoGrid: { display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px', flexWrap: 'wrap' },
  videoWrapper: { width: '45%', minWidth: '300px', backgroundColor: '#f0f0f0', padding: '10px', borderRadius: '8px' },
  video: { width: '100%', borderRadius: '8px', backgroundColor: '#000', display: 'block' },
  placeholder: { width: '100%', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#333', color: '#aaa', borderRadius: '8px' },
  logContainer: { marginTop: '30px', textAlign: 'left', backgroundColor: '#222', color: '#0f0', padding: '15px', borderRadius: '8px', maxHeight: '300px', overflowY: 'auto', border: '1px solid #444', fontFamily: 'monospace' },
  logEntry: { margin: '2px 0', fontSize: '12px', borderBottom: '1px solid #333' }
};

export default VideoCall;
