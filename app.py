from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room
import chess
import random
import string

app = Flask(__name__)
app.config["SECRET_KEY"] = "chess-secret"

socketio = SocketIO(app, cors_allowed_origins="*")

games = {}


def create_room_code():
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if code not in games:
            return code


@app.route("/")
def index():
    return render_template("index.html")


@socketio.on("create_game")
def create_game():
    room = create_room_code()

    games[room] = {
        "board": chess.Board(),
        "players": {}
    }

    join_room(room)

    games[room]["players"][request.sid] = "white"

    socketio.emit(
        "game_created",
        {
            "room": room,
            "color": "white",
            "fen": games[room]["board"].fen()
        },
        to=request.sid
    )


@socketio.on("join_game")
def join_game(data):
    room = data.get("room", "").upper().strip()

    if room not in games:
        socketio.emit("error_message", {"message": "Game not found."}, to=request.sid)
        return

    game = games[room]

    if len(game["players"]) >= 2:
        socketio.emit("error_message", {"message": "Game is full."}, to=request.sid)
        return

    join_room(room)

    game["players"][request.sid] = "black"

    socketio.emit(
        "game_joined",
        {
            "room": room,
            "color": "black",
            "fen": game["board"].fen()
        },
        to=request.sid
    )

    socketio.emit(
        "opponent_joined",
        {
            "fen": game["board"].fen()
        },
        to=room
    )


@socketio.on("make_move")
def make_move(data):
    room = data.get("room")
    move_uci = data.get("move")

    if room not in games:
        return

    game = games[room]
    board = game["board"]

    player_color = game["players"].get(request.sid)

    if player_color is None:
        return

    if (board.turn == chess.WHITE and player_color != "white") or \
       (board.turn == chess.BLACK and player_color != "black"):
        return

    try:
        move = chess.Move.from_uci(move_uci)
    except ValueError:
        return

    # Promotion must be specified when a pawn reaches the last rank.
    piece = board.piece_at(move.from_square)

    if piece and piece.piece_type == chess.PAWN:
        if chess.square_rank(move.to_square) in (0, 7) and move.promotion is None:
            socketio.emit(
                "invalid_move",
                {"message": "Pawn promotion required."},
                to=request.sid
            )
            return

    if move not in board.legal_moves:
        socketio.emit(
            "invalid_move",
            {"message": "Illegal move."},
            to=request.sid
        )
        return

    captured_piece = None

    if board.is_capture(move):
        captured_piece = board.piece_at(move.to_square)

        # En passant capture
        if captured_piece is None and board.is_en_passant(move):
            captured_piece = chess.Piece(
                chess.PAWN,
                not board.turn
            )

    board.push(move)

    status = "playing"
    winner = None

    if board.is_checkmate():
        status = "checkmate"
        winner = player_color
    elif board.is_stalemate():
        status = "stalemate"
    elif board.is_insufficient_material():
        status = "draw"
    elif board.is_check():
        status = "check"

    socketio.emit(
        "move_made",
        {
            "fen": board.fen(),
            "move": move_uci,
            "status": status,
            "winner": winner,
            "captured": captured_piece.symbol() if captured_piece else None,
            "capturedBy": player_color if captured_piece else None
        },
        to=room
    )


@socketio.on("new_game")
def new_game(data):
    room = data.get("room")

    if room not in games:
        return

    game = games[room]

    # Only allow a current player to restart the game
    if request.sid not in game["players"]:
        return

    game["board"] = chess.Board()

    socketio.emit(
        "new_game_started",
        {
            "fen": game["board"].fen()
        },
        to=room
    )


@socketio.on("disconnect")
def disconnect():
    for room, game in list(games.items()):
        if request.sid in game["players"]:
            del game["players"][request.sid]

            socketio.emit(
                "opponent_left",
                {},
                to=room
            )

            if len(game["players"]) == 0:
                del games[room]


if __name__ == "__main__":
    import os

    port = int(os.environ.get("PORT", 5000))

    print("♟️ Chess server starting...")
    socketio.run(app, host="0.0.0.0", port=port)
