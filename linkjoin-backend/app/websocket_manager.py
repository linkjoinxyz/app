import secrets
from fastapi import WebSocket
from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK


class WebSocketManager:
    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, email: str) -> None:
        await websocket.accept()
        self.connections.setdefault(email, [])
        if websocket not in self.connections[email]:
            self.connections[email].append(websocket)

    def disconnect(self, websocket: WebSocket, email: str) -> None:
        conns = self.connections.get(email, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self.connections.pop(email, None)

    async def broadcast(self, data: dict, email: str) -> None:
        data["update_id"] = secrets.token_hex(16)
        conns = list(self.connections.get(email, []))
        dead = []
        for ws in conns:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, email)


manager = WebSocketManager()
