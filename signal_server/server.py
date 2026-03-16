"""
Signaling Server for WebRTC
---------------------------
This server acts as a relay for:
1. Delivering SDP (Session Description Protocol): Offers and Answers.
2. Delivering ICE Candidates: Network endpoints for P2P connection.
It facilitates the negotiation of media capabilities and security keys.
Once the handshake is complete, media flows directly between peers.
"""
# flake8: noqa
import socketio  # pyright: ignore[reportMissingImports]
import uvicorn  # pyright: ignore[reportMissingImports]
import inspect
import functools
import json


# 1. Setup Socket.IO Server (Async)
# cors_allowed_origins='*'
#   allows the React app (on a different port) to connect
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

# 2. Wrap the socket server in an ASGI application
app = socketio.ASGIApp(sio)


def log(msg, frame=None):
    if not frame:
        frame = inspect.currentframe().f_back
    caller_name = frame.f_code.co_name if frame else __name__
    line_no = frame.f_lineno if frame else 0
    filename = frame.f_code.co_filename if frame else "__global__"
    header = f"[{filename}:{line_no}:{caller_name}()] "

    print(header + msg.replace('\n', f'\n{header}'))


def log_event(func):
    """Decorator to log function start/end with line numbers and arguments."""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        msg = "START"
        msg += f"{args}" if args else ""
        msg += f"{kwargs}" if kwargs else ""
        try:
            log(msg, frame=inspect.currentframe().f_back)
            return await func(*args, **kwargs)
        finally:
            log("END")
    return wrapper


async def emit_log(event, data, **kwargs):
    payload = f"\nPayload: {json.dumps(data, indent=2, default=str)}".replace('\\r\\n', '\n')

    msg = f"Emitting '{event}' "
    msg += f", Room '{kwargs['room']}'" if 'room' in kwargs else ""
    msg += f", Skipping SID: {kwargs['skip_sid']}" if 'skip_sid' in kwargs else ""
    msg += payload[:50] + " ... " + payload[-50:]

    log(msg, frame=inspect.currentframe().f_back)
    await sio.emit(event, data, **kwargs)


async def get_room_participants(room_id):
    """Utility to get the list of participants in a room."""
    namespace = '/'
    if not hasattr(sio.manager, 'rooms'):
        log("Error: sio.manager.rooms is not available. Cannot inspect room participants.")
        return []
    if namespace not in sio.manager.rooms:
        log(f"Error: Namespace '{namespace}' not found in sio.manager.rooms.")
        return []

    occupants = sio.manager.rooms[namespace].get(room_id, {})
    return list(occupants)


@log_event
@sio.event
async def connect(sid, environ):
    pass


@log_event
@sio.event
async def disconnect(sid):
    pass


@log_event
@sio.event
async def join_room(sid, data):
    # Robustly extract room_id and username
    if isinstance(data, dict):
        room_id = data.get('roomId')
        username = data.get('username', 'Anonymous')
    else:
        room_id = data
        username = 'Anonymous'

    if not room_id:
        log(f"Error: User {sid} attempted to join without a roomId.")
        return

    room_id = str(room_id)
    # Use Socket.IO's built-in room management
    log(f"Log: User {sid} ({username}) joining room {room_id}...")
    await sio.enter_room(sid, room_id)

    occupants = await get_room_participants(room_id)
    log(f"Log: Room '{room_id}' participants count = {len(occupants)}")
    log(f"     ➜  participants: {"\n     ➜  ".join(list(occupants))}")

    response_data = {'peerId': sid, 'username': username}
    log(f"Emitting 'peer_joined' {response_data}")
    await sio.emit('peer_joined', response_data, room=room_id, skip_sid=sid)


@log_event
@sio.event
async def offer(sid, data):
    room_id = data.get('roomId')
    sdp = data.get('sdp')
    caller_username = data.get('username')
    target = data.get('target')

    if room_id and sdp:
        response_data = {'sdp': sdp, 'caller': sid, 'username': caller_username}
        if target:
            log(f"Emitting 'offer' to target={target}, sid={sid}")
            await sio.emit('offer', response_data, to=target)
        else:
            # Fallback for broadcast if needed
            log(f"Emitting 'offer' to room={room_id}, sid={sid}")
            await sio.emit('offer', response_data, room=room_id, skip_sid=sid)


@log_event
@sio.event
async def answer(sid, data):
    room_id = data.get('roomId')
    sdp = data.get('sdp')
    responder_username = data.get('username')
    target = data.get('target')

    if room_id and sdp:
        response_data = {'sdp': sdp, 'responder': sid, 'username': responder_username}
        if target:
            log(f"Emitting 'answer' to target={target}, sid={sid}")
            await sio.emit('answer', response_data, to=target)
        else:
            log(f"Emitting 'answer' to room={room_id}, sid={sid}")
            await sio.emit('answer', response_data, room=room_id, skip_sid=sid)


@log_event
@sio.event
async def ice_candidate(sid, data):
    room_id = data.get('roomId')
    candidate = data.get('candidate')
    target = data.get('target')

    if room_id and candidate:
        response_data = {'candidate': candidate, 'from': sid}
        if target:
            log(f"Emitting 'ice_candidate' to target={target}, sid={sid}")
            await sio.emit('ice_candidate', response_data, to=target)
        else:
            log(f"Emitting 'ice_candidate' to room={room_id}, sid={sid}")
            await sio.emit('ice_candidate', response_data, room=room_id, skip_sid=sid)


if __name__ == '__main__':
    log("Starting React-WebRTC-Signaler...")
    # Run on port 3000 to match the React client's configuration
    uvicorn.run(app, host='0.0.0.0', port=3000)
